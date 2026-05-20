pub mod payload;
pub mod sender;
pub mod signer;
pub mod signing;

use std::time::Duration;

use thiserror::Error;

use crate::thruster::payload::InteractionType;
use crate::thruster::sender::{SenderError, ThrusterSender, ThrusterStats};

/// Configuration for a thruster load-testing run.
#[derive(Debug, Clone)]
pub struct ThrusterConfig {
    pub target_url: String,
    pub app_id: String,
    pub private_key: [u8; 32],
    pub tps: u32,
    pub duration: Duration,
    pub interaction_type: InteractionType,
}

/// Errors that can occur while building a ThrusterConfig or constructing an orchestrator.
#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("invalid private key: {0}")]
    InvalidPrivateKey(String),

    #[error("sender error: {0}")]
    Sender(#[from] SenderError),
}

/// Top-level orchestrator that wires signing → HTTP → metrics.
pub struct ThrusterOrchestrator {
    sender: ThrusterSender,
    duration: Duration,
}

impl ThrusterOrchestrator {
    /// Build a new orchestrator from configuration.
    ///
    /// Creates the internal sender with pre-signed payloads and HTTP client.
    pub fn new(config: ThrusterConfig) -> Result<Self, ConfigError> {
        let sender = ThrusterSender::new(
            &config.target_url,
            config.tps,
            &config.private_key,
            &config.app_id,
        )?;
        Ok(Self {
            sender,
            duration: config.duration,
        })
    }

    /// Run the thruster for the configured duration.
    ///
    /// Returns aggregated `ThrusterStats`. If a SIGTERM (Ctrl+C) is received,
    /// returns zeroed stats and exits gracefully.
    pub async fn run(&self) -> ThrusterStats {
        tokio::select! {
            stats = self.sender.run(self.duration) => stats,
            _ = tokio::signal::ctrl_c() => {
                ThrusterStats {
                    requests_sent: 0,
                    errors: 0,
                    latency_p50: Duration::ZERO,
                    latency_p99: Duration::ZERO,
                    actual_tps: 0.0,
                    duration: Duration::ZERO,
                }
            }
        }
        return stats;
    }
}

/// Convert CLI `ThrusterArgs` into a library-usable `ThrusterConfig`.
///
/// Parses the hex-encoded private key and maps CLI interaction types
/// to their payload equivalents.
pub fn config_from_args(args: &crate::cli::ThrusterArgs) -> Result<ThrusterConfig, ConfigError> {
    let private_key = hex_to_key(&args.private_key).map_err(ConfigError::InvalidPrivateKey)?;
    Ok(ThrusterConfig {
        target_url: args.target_url.clone(),
        app_id: args.app_id.to_string(),
        private_key,
        tps: args.tps,
        duration: Duration::from_secs(args.duration),
        interaction_type: cli_interaction_to_payload(&args.interaction_type),
    })
}

/// Decode a 64-character hex string into a 32-byte Ed25519 private key.
fn hex_to_key(hex_str: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(hex_str).map_err(|e| format!("invalid hex encoding: {e}"))?;
    let len = bytes.len();
    bytes
        .try_into()
        .map_err(|_| format!("expected 32 bytes, got {len}"))
}

/// Map the CLI interaction type enum to the payload interaction type enum.
fn cli_interaction_to_payload(cli_type: &crate::cli::InteractionType) -> InteractionType {
    match cli_type {
        crate::cli::InteractionType::Ping => InteractionType::Ping,
        crate::cli::InteractionType::ApplicationCommand => InteractionType::ApplicationCommand,
        crate::cli::InteractionType::MessageComponent => InteractionType::MessageComponent,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    const TEST_PRIVATE_KEY: [u8; 32] = [
        0x9d, 0x61, 0xb1, 0x9d, 0xef, 0xfd, 0x5a, 0x60, 0xba, 0x84, 0x4a, 0xf4, 0x92, 0xec, 0x2c,
        0xc4, 0x44, 0x49, 0xc5, 0x69, 0x7b, 0x32, 0x69, 0x19, 0x70, 0x3b, 0xac, 0x03, 0x1c, 0xae,
        0x7f, 0x60,
    ];

    const TEST_PRIVATE_KEY_HEX: &str =
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

    async fn start_mock_server() -> (SocketAddr, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let counter = Arc::new(AtomicUsize::new(0));

        let c = counter.clone();
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                let c = c.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 8192];
                    let _ = socket.read(&mut buf).await;
                    let response =
                        b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                    let _ = socket.write_all(response).await;
                    c.fetch_add(1, Ordering::Relaxed);
                });
            }
        });

        (addr, counter)
    }

    #[tokio::test]
    async fn test_orchestrator_builds_and_runs() {
        let (addr, counter) = start_mock_server().await;
        let config = ThrusterConfig {
            target_url: format!("http://{addr}/interactions"),
            app_id: "test-app".into(),
            private_key: TEST_PRIVATE_KEY,
            tps: 50,
            duration: Duration::from_millis(500),
            interaction_type: InteractionType::ApplicationCommand,
        };
        let orchestrator = ThrusterOrchestrator::new(config).expect("orchestrator must build");
        let stats = orchestrator.run().await;

        let received = counter.load(Ordering::Relaxed);
        assert!(
            received > 0,
            "mock server must receive at least 1 request, got {received}"
        );
        assert!(
            stats.requests_sent > 0,
            "stats must report at least 1 successful request"
        );
        assert!(
            stats.errors < stats.requests_sent.max(1) * 2,
            "errors should not vastly exceed requests"
        );
        assert!(stats.actual_tps > 0.0, "actual_tps must be positive");
        assert!(stats.duration > Duration::ZERO, "duration must be non-zero");
    }

    #[test]
    fn test_config_from_args() {
        use crate::cli::VesselCli;
        use clap::Parser;

        let cli = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "123456789",
            "--private-key",
            TEST_PRIVATE_KEY_HEX,
            "--target-url",
            "https://example.com",
            "--tps",
            "500",
            "--duration",
            "30",
            "--interaction-type",
            "ping",
        ])
        .expect("CLI parse must succeed");

        let args = match &cli.command {
            crate::cli::Command::Thruster(args) => args,
            _ => panic!("expected Thruster command"),
        };

        let config = config_from_args(args).expect("config_from_args must succeed");
        assert_eq!(config.app_id, "123456789");
        assert_eq!(config.target_url, "https://example.com");
        assert_eq!(config.tps, 500);
        assert_eq!(config.duration, Duration::from_secs(30));
        assert_eq!(config.private_key, TEST_PRIVATE_KEY);
        assert_eq!(config.interaction_type, InteractionType::Ping);
    }

    #[test]
    fn test_config_from_args_defaults() {
        use crate::cli::VesselCli;
        use clap::Parser;

        let cli = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "123456789",
            "--private-key",
            TEST_PRIVATE_KEY_HEX,
            "--target-url",
            "https://example.com",
        ])
        .expect("CLI parse must succeed");

        let args = match &cli.command {
            crate::cli::Command::Thruster(args) => args,
            _ => panic!("expected Thruster command"),
        };

        let config = config_from_args(args).expect("config_from_args must succeed");
        assert_eq!(config.tps, 1000);
        assert_eq!(config.duration, Duration::from_secs(60));
        assert_eq!(config.interaction_type, InteractionType::Ping);
    }

    #[test]
    fn test_config_from_args_application_command() {
        use crate::cli::VesselCli;
        use clap::Parser;

        let cli = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "1",
            "--private-key",
            TEST_PRIVATE_KEY_HEX,
            "--target-url",
            "https://x.com",
            "--interaction-type",
            "application-command",
        ])
        .expect("CLI parse must succeed");

        let args = match &cli.command {
            crate::cli::Command::Thruster(args) => args,
            _ => panic!("expected Thruster command"),
        };

        let config = config_from_args(args).expect("config_from_args must succeed");
        assert_eq!(config.interaction_type, InteractionType::ApplicationCommand);
    }

    #[test]
    fn test_config_from_args_message_component() {
        use crate::cli::VesselCli;
        use clap::Parser;

        let cli = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "1",
            "--private-key",
            TEST_PRIVATE_KEY_HEX,
            "--target-url",
            "https://x.com",
            "--interaction-type",
            "message-component",
        ])
        .expect("CLI parse must succeed");

        let args = match &cli.command {
            crate::cli::Command::Thruster(args) => args,
            _ => panic!("expected Thruster command"),
        };

        let config = config_from_args(args).expect("config_from_args must succeed");
        assert_eq!(config.interaction_type, InteractionType::MessageComponent);
    }

    #[tokio::test]
    async fn test_graceful_shutdown() {
        let (addr, _counter) = start_mock_server().await;
        let config = ThrusterConfig {
            target_url: format!("http://{addr}/interactions"),
            app_id: "test-app".into(),
            private_key: TEST_PRIVATE_KEY,
            tps: 10,
            duration: Duration::from_secs(10),
            interaction_type: InteractionType::Ping,
        };
        let orchestrator = ThrusterOrchestrator::new(config).expect("orchestrator must build");

        let handle = tokio::spawn(async move { orchestrator.run().await });
        tokio::time::sleep(Duration::from_millis(300)).await;
        handle.abort();

        let _ = handle.await;
    }

    #[test]
    fn test_hex_to_key_valid() {
        let key = hex_to_key(TEST_PRIVATE_KEY_HEX).expect("valid hex must decode");
        assert_eq!(key, TEST_PRIVATE_KEY);
    }

    #[test]
    fn test_hex_to_key_invalid_length() {
        let result = hex_to_key("abcd");
        assert!(result.is_err(), "short hex must fail");
    }

    #[test]
    fn test_hex_to_key_invalid_chars() {
        let result = hex_to_key("zz".repeat(32).as_str());
        assert!(result.is_err(), "invalid hex chars must fail");
    }

    #[test]
    fn test_cli_interaction_to_payload_all_variants() {
        use crate::cli::InteractionType as CliType;

        assert_eq!(
            cli_interaction_to_payload(&CliType::Ping),
            InteractionType::Ping
        );
        assert_eq!(
            cli_interaction_to_payload(&CliType::ApplicationCommand),
            InteractionType::ApplicationCommand
        );
        assert_eq!(
            cli_interaction_to_payload(&CliType::MessageComponent),
            InteractionType::MessageComponent
        );
    }
}
