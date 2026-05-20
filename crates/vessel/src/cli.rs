use clap::Parser;
use std::path::PathBuf;

/// CLI for Vessel - competitive matchmaking load testing toolkit
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
pub struct VesselCli {
    #[arg(long, global = true)]
    pub database_url: Option<String>,

    #[arg(short, long, global = true)]
    pub verbose: bool,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Parser, Debug)]
pub enum Command {
    /// Siphon stats from a seed player through social graph traversal
    Siphon(SiphonArgs),
    /// Thruster load testing for Discord bot endpoints
    Thruster(ThrusterArgs),
    /// Purge cached bloom filter data
    Purge(PurgeArgs),
}

/// Arguments for Siphon command - social graph traversal
#[derive(Parser, Debug)]
pub struct SiphonArgs {
    #[arg(long)]
    pub seed_player: String,

    #[arg(long, value_enum, default_value = "pc")]
    pub platform: StatsPlatform,

    #[arg(long, default_value = "5")]
    pub max_depth: u32,

    #[arg(long, default_value = "0.01")]
    pub bloom_fp_rate: f64,

    #[arg(long, default_value = "1024")]
    pub channel_capacity: usize,
}

/// Arguments for Thruster command - Discord bot load testing
#[derive(Parser, Debug)]
pub struct ThrusterArgs {
    #[arg(long)]
    pub app_id: u64,

    #[arg(long, value_parser = parse_private_key)]
    pub private_key: String,

    #[arg(long)]
    pub target_url: String,

    #[arg(long, default_value = "1000")]
    pub tps: u32,

    #[arg(long, default_value = "60")]
    pub duration: u64,

    #[arg(long, value_enum, default_value = "ping")]
    pub interaction_type: InteractionType,
}

/// Arguments for Purge command - bloom filter cache cleanup
#[derive(Parser, Debug)]
pub struct PurgeArgs {
    #[arg(long)]
    pub session_id: uuid::Uuid,

    #[arg(long)]
    pub bloom_cache_path: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq, clap::ValueEnum)]
pub enum StatsPlatform {
    Pc,
    Xbox,
    Playstation,
}

#[derive(Clone, Debug, PartialEq, Eq, clap::ValueEnum)]
pub enum InteractionType {
    Ping,
    ApplicationCommand,
    MessageComponent,
}

fn parse_private_key(s: &str) -> Result<String, String> {
    if s.len() != 64 {
        return Err(format!(
            "private key must be exactly 64 hex characters, got {}",
            s.len()
        ));
    }
    if !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("private key must contain only hexadecimal characters".to_string());
    }
    Ok(s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_siphon_args_parsing() {
        let args = VesselCli::try_parse_from([
            "vessel",
            "siphon",
            "--seed-player",
            "player123",
            "--platform",
            "xbox",
            "--max-depth",
            "10",
        ])
        .unwrap();

        match args.command {
            Command::Siphon(s) => {
                assert_eq!(s.seed_player, "player123");
                assert_eq!(s.platform, StatsPlatform::Xbox);
                assert_eq!(s.max_depth, 10);
                assert_eq!(s.bloom_fp_rate, 0.01);
                assert_eq!(s.channel_capacity, 1024);
            }
            _ => panic!("expected Siphon command"),
        }
    }

    #[test]
    fn test_siphon_defaults() {
        let args =
            VesselCli::try_parse_from(["vessel", "siphon", "--seed-player", "player123"]).unwrap();

        match args.command {
            Command::Siphon(s) => {
                assert_eq!(s.platform, StatsPlatform::Pc);
                assert_eq!(s.max_depth, 5);
                assert_eq!(s.bloom_fp_rate, 0.01);
                assert_eq!(s.channel_capacity, 1024);
            }
            _ => panic!("expected Siphon command"),
        }
    }

    #[test]
    fn test_thruster_args_parsing() {
        let args = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "123456789",
            "--private-key",
            "a".repeat(64).as_str(),
            "--target-url",
            "https://example.com",
            "--tps",
            "500",
            "--duration",
            "30",
            "--interaction-type",
            "application-command",
        ])
        .unwrap();

        match args.command {
            Command::Thruster(t) => {
                assert_eq!(t.app_id, 123456789);
                assert_eq!(t.private_key, "a".repeat(64));
                assert_eq!(t.target_url, "https://example.com");
                assert_eq!(t.tps, 500);
                assert_eq!(t.duration, 30);
                assert_eq!(t.interaction_type, InteractionType::ApplicationCommand);
            }
            _ => panic!("expected Thruster command"),
        }
    }

    #[test]
    fn test_thruster_defaults() {
        let args = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "123456789",
            "--private-key",
            "b".repeat(64).as_str(),
            "--target-url",
            "https://example.com",
        ])
        .unwrap();

        match args.command {
            Command::Thruster(t) => {
                assert_eq!(t.tps, 1000);
                assert_eq!(t.duration, 60);
                assert_eq!(t.interaction_type, InteractionType::Ping);
            }
            _ => panic!("expected Thruster command"),
        }
    }

    #[test]
    fn test_private_key_invalid_length() {
        let result = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "123456789",
            "--private-key",
            "short",
            "--target-url",
            "https://example.com",
        ]);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("64 hex characters"));
    }

    #[test]
    fn test_private_key_invalid_chars() {
        let result = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "123456789",
            "--private-key",
            "g".repeat(64).as_str(),
            "--target-url",
            "https://example.com",
        ]);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("hexadecimal"));
    }

    #[test]
    fn test_purge_args_parsing() {
        let args = VesselCli::try_parse_from([
            "vessel",
            "purge",
            "--session-id",
            "550e8400-e29b-41d4-a716-446655440000",
            "--bloom-cache-path",
            "/tmp/bloom.dat",
        ])
        .unwrap();

        match args.command {
            Command::Purge(p) => {
                assert_eq!(
                    p.session_id,
                    uuid::Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap()
                );
                assert_eq!(p.bloom_cache_path, PathBuf::from("/tmp/bloom.dat"));
            }
            _ => panic!("expected Purge command"),
        }
    }

    #[test]
    fn test_global_args() {
        let args = VesselCli::try_parse_from([
            "vessel",
            "--database-url",
            "postgres://localhost/db",
            "--verbose",
            "siphon",
            "--seed-player",
            "player123",
        ])
        .unwrap();

        assert_eq!(
            args.database_url,
            Some("postgres://localhost/db".to_string())
        );
        assert!(args.verbose);
    }

    #[test]
    fn test_interaction_type_values() {
        let ping = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "1",
            "--private-key",
            "c".repeat(64).as_str(),
            "--target-url",
            "https://x.com",
            "--interaction-type",
            "ping",
        ])
        .unwrap();

        match ping.command {
            Command::Thruster(t) => assert_eq!(t.interaction_type, InteractionType::Ping),
            _ => panic!(),
        }

        let msg_comp = VesselCli::try_parse_from([
            "vessel",
            "thruster",
            "--app-id",
            "1",
            "--private-key",
            "d".repeat(64).as_str(),
            "--target-url",
            "https://x.com",
            "--interaction-type",
            "message-component",
        ])
        .unwrap();

        match msg_comp.command {
            Command::Thruster(t) => {
                assert_eq!(t.interaction_type, InteractionType::MessageComponent)
            }
            _ => panic!(),
        }
    }
}
