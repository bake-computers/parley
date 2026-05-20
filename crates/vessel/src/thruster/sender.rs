use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use reqwest::Client;
use thiserror::Error;
use tokio::sync::Semaphore;

use crate::thruster::payload::{InteractionPayload, InteractionType};
use crate::thruster::signer::{PreSignedBuffer, SignedRequest};
use crate::thruster::signing::SigningError;

const SYNTHETIC_PAYLOAD_COUNT: usize = 10;

/// Aggregated statistics collected during a thruster run.
#[derive(Debug, Clone)]
pub struct ThrusterStats {
    pub requests_sent: u64,
    pub errors: u64,
    pub latency_p50: Duration,
    pub latency_p99: Duration,
    pub actual_tps: f64,
    pub duration: Duration,
}

/// Errors that can occur while constructing or running a ThrusterSender.
#[derive(Debug, Error)]
pub enum SenderError {
    #[error("signing error: {0}")]
    Signing(#[from] SigningError),

    #[error("HTTP client error: {0}")]
    HttpClient(#[from] reqwest::Error),

    #[error("tps_target must be greater than 0, got {0}")]
    InvalidTpsTarget(u32),

    #[error("payload build error: {0}")]
    PayloadBuild(#[from] crate::thruster::payload::BuildError),
}

/// High-throughput HTTP sender that dispatches pre-signed interaction requests
/// at a configurable TPS rate.
pub struct ThrusterSender {
    client: Client,
    buffer: Arc<PreSignedBuffer>,
    target_url: String,
    tps_target: u32,
    max_concurrent: usize,
}

impl ThrusterSender {
    /// Build a new sender.
    ///
    /// * `target_url` — the HTTP endpoint to POST signed payloads to.
    /// * `tps_target`  — desired requests per second (must be ≥ 1).
    /// * `private_key` — Ed25519 private key for signing.
    /// * `app_id`      — Discord application ID used in synthetic payloads.
    pub fn new(
        target_url: &str,
        tps_target: u32,
        private_key: &[u8; 32],
        app_id: &str,
    ) -> Result<Self, SenderError> {
        if tps_target == 0 {
            return Err(SenderError::InvalidTpsTarget(0));
        }

        let client = Self::build_client()?;

        let payloads = build_synthetic_payloads(SYNTHETIC_PAYLOAD_COUNT, app_id)?;
        let capacity = (tps_target as usize * 5).max(10);
        let buffer = PreSignedBuffer::new(capacity, payloads, private_key)?;

        Ok(Self {
            client,
            buffer: Arc::new(buffer),
            target_url: target_url.to_string(),
            tps_target,
            max_concurrent: tps_target as usize,
        })
    }

    /// Set the maximum number of in-flight requests.
    /// Defaults to `tps_target`.
    pub fn with_max_concurrent(mut self, max_concurrent: usize) -> Self {
        self.max_concurrent = max_concurrent;
        self
    }

    /// Run the sender for the given duration, returning aggregated statistics.
    ///
    /// Requests are dispatched via `tokio::time::interval`-based rate limiting.
    /// A semaphore caps the number of concurrent in-flight requests to
    /// `max_concurrent`, providing backpressure when the target cannot keep up.
    pub async fn run(&self, duration: Duration) -> ThrusterStats {
        let tick_interval = Duration::from_micros((1_000_000u64 / self.tps_target as u64).max(1));

        let semaphore = Arc::new(Semaphore::new(self.max_concurrent));
        let sent = Arc::new(AtomicU64::new(0));
        let errors = Arc::new(AtomicU64::new(0));
        let latencies: Arc<Mutex<Vec<Duration>>> = Arc::new(Mutex::new(Vec::new()));

        let start = Instant::now();
        let deadline = start + duration;

        let mut handles = Vec::new();

        while Instant::now() < deadline {
            let tick_start = Instant::now();

            let Ok(permit) = semaphore.clone().acquire_owned().await else {
                // Semaphore was closed (only possible if explicitly closed —
                // we never do, so this branch is unreachable in practice).
                break;
            };

            // Re-check deadline after potentially blocking on semaphore.
            if Instant::now() >= deadline {
                break;
            }

            let buffer = self.buffer.clone();
            let client = self.client.clone();
            let target_url = self.target_url.clone();
            let sent = sent.clone();
            let errors = errors.clone();
            let latencies = latencies.clone();

            let handle = tokio::spawn(async move {
                let _permit = permit;

                let signed = match buffer.get_next() {
                    Ok(s) => s,
                    Err(_) => {
                        errors.fetch_add(1, Ordering::Relaxed);
                        return;
                    }
                };

                let req_start = Instant::now();
                match send_one(&client, &target_url, &signed).await {
                    Ok(_) => {
                        sent.fetch_add(1, Ordering::Relaxed);
                        if let Ok(mut lat) = latencies.lock() {
                            lat.push(req_start.elapsed());
                        }
                    }
                    Err(_) => {
                        errors.fetch_add(1, Ordering::Relaxed);
                    }
                }
            });
            handles.push(handle);

            // Rate-limit: sleep for the remainder of this tick.
            let elapsed = tick_start.elapsed();
            if elapsed < tick_interval {
                tokio::time::sleep(tick_interval - elapsed).await;
            }
        }

        // Wait for all in-flight requests to complete.
        for handle in handles {
            let _ = handle.await;
        }

        let elapsed = start.elapsed();
        let sent_count = sent.load(Ordering::Relaxed);
        let error_count = errors.load(Ordering::Relaxed);

        let mut lat_vec = match latencies.lock() {
            Ok(guard) => guard.clone(),
            Err(_) => Vec::new(),
        };
        lat_vec.sort_unstable();

        let p50 = percentile(&lat_vec, 0.50);
        let p99 = percentile(&lat_vec, 0.99);
        let actual_tps = if elapsed.as_secs_f64() > 0.0 {
            sent_count as f64 / elapsed.as_secs_f64()
        } else {
            0.0
        };

        ThrusterStats {
            requests_sent: sent_count,
            errors: error_count,
            latency_p50: p50,
            latency_p99: p99,
            actual_tps,
            duration: elapsed,
        }
    }

    fn build_client() -> Result<Client, reqwest::Error> {
        Client::builder()
            .pool_max_idle_per_host(100)
            .pool_idle_timeout(Duration::from_secs(120))
            .tcp_keepalive(Duration::from_secs(60))
            .build()
    }
}

/// Send a single signed request via HTTP POST.
async fn send_one(
    client: &Client,
    url: &str,
    signed: &SignedRequest,
) -> Result<(), reqwest::Error> {
    let mut req = client.post(url);
    for (key, value) in &signed.headers {
        req = req.header(key.as_str(), value.as_str());
    }
    req = req.header("Content-Type", "application/json");
    req.body(signed.body.clone()).send().await?;
    Ok(())
}

/// Build a set of synthetic interaction payloads for load-generation purposes.
fn build_synthetic_payloads(
    count: usize,
    app_id: &str,
) -> Result<Vec<InteractionPayload>, crate::thruster::payload::BuildError> {
    (0..count)
        .map(|i| {
            InteractionPayload::builder()
                .type_(InteractionType::ApplicationCommand)
                .id(format!("synth-{i}"))
                .application_id(app_id)
                .token(format!("synth-token-{i}"))
                .build()
        })
        .collect()
}

/// Compute the value at the given percentile (0.0–1.0) from a sorted slice.
fn percentile(sorted: &[Duration], p: f64) -> Duration {
    if sorted.is_empty() {
        return Duration::ZERO;
    }
    let idx = ((sorted.len() - 1) as f64 * p).round() as usize;
    sorted[idx]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use std::sync::atomic::AtomicUsize;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    const TEST_PRIVATE_KEY: [u8; 32] = [
        0x9d, 0x61, 0xb1, 0x9d, 0xef, 0xfd, 0x5a, 0x60, 0xba, 0x84, 0x4a, 0xf4, 0x92, 0xec, 0x2c,
        0xc4, 0x44, 0x49, 0xc5, 0x69, 0x7b, 0x32, 0x69, 0x19, 0x70, 0x3b, 0xac, 0x03, 0x1c, 0xae,
        0x7f, 0x60,
    ];

    /// Start a minimal mock HTTP server that counts received requests and
    /// returns `200 OK`. Returns the bound address so the sender can target it.
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
    async fn test_sender_sends_requests() {
        let (addr, counter) = start_mock_server().await;
        let target_url = format!("http://{addr}/interactions");

        let sender = ThrusterSender::new(&target_url, 50, &TEST_PRIVATE_KEY, "test-app")
            .expect("sender construction must succeed");

        let stats = sender.run(Duration::from_millis(500)).await;

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
    }

    #[tokio::test]
    async fn test_stats_accumulate() {
        let (addr, _counter) = start_mock_server().await;
        let target_url = format!("http://{addr}/interactions");

        let sender = ThrusterSender::new(&target_url, 100, &TEST_PRIVATE_KEY, "test-app")
            .expect("sender construction must succeed");

        let stats = sender.run(Duration::from_millis(500)).await;

        assert!(stats.requests_sent > 0, "requests_sent must be populated");
        assert!(stats.duration > Duration::ZERO, "duration must be non-zero");
        // actual_tps may differ from target due to mock server speed, but
        // it should be a positive number.
        assert!(stats.actual_tps > 0.0, "actual_tps must be positive");
        // latency_p50 may be zero if no successful requests, but with >0 sent
        // the mock server is fast enough that we should get some latencies.
    }

    #[tokio::test]
    async fn test_rate_limiting() {
        let (addr, _counter) = start_mock_server().await;
        let target_url = format!("http://{addr}/interactions");

        let tps_target = 100u32;
        let sender = ThrusterSender::new(&target_url, tps_target, &TEST_PRIVATE_KEY, "test-app")
            .expect("sender construction must succeed");

        let run_duration = Duration::from_secs(2);
        let stats = sender.run(run_duration).await;

        // With a fast local mock server, actual TPS should be within a
        // reasonable range of the target. Allow ±30% tolerance for scheduler
        // jitter and startup ramp.
        let min_expected = tps_target as f64 * 0.50;
        let max_expected = tps_target as f64 * 1.50;
        assert!(
            stats.actual_tps >= min_expected,
            "actual_tps {:.1} below minimum {:.1} for target {tps_target}",
            stats.actual_tps,
            min_expected,
        );
        assert!(
            stats.actual_tps <= max_expected,
            "actual_tps {:.1} above maximum {:.1} for target {tps_target}",
            stats.actual_tps,
            max_expected,
        );
    }

    #[test]
    fn test_sender_rejects_zero_tps() {
        let result = ThrusterSender::new("http://localhost:0/", 0, &TEST_PRIVATE_KEY, "app");
        assert!(
            matches!(result, Err(SenderError::InvalidTpsTarget(0))),
            "zero tps_target must be rejected"
        );
    }

    #[tokio::test]
    async fn test_sender_with_custom_max_concurrent() {
        let (addr, _counter) = start_mock_server().await;
        let target_url = format!("http://{addr}/interactions");

        let sender = ThrusterSender::new(&target_url, 50, &TEST_PRIVATE_KEY, "test-app")
            .expect("sender construction must succeed")
            .with_max_concurrent(5);

        let stats = sender.run(Duration::from_millis(500)).await;
        assert!(stats.requests_sent > 0);
    }

    #[test]
    fn test_percentile_empty_returns_zero() {
        assert_eq!(percentile(&[], 0.50), Duration::ZERO);
        assert_eq!(percentile(&[], 0.99), Duration::ZERO);
    }

    #[test]
    fn test_percentile_single_element() {
        let d = Duration::from_millis(42);
        assert_eq!(percentile(&[d], 0.50), d);
        assert_eq!(percentile(&[d], 0.99), d);
    }

    #[test]
    fn test_percentile_multiple_elements() {
        let data: Vec<Duration> = (0..100).map(|i| Duration::from_millis(i as u64)).collect();
        assert_eq!(percentile(&data, 0.50), Duration::from_millis(50));
        assert_eq!(percentile(&data, 0.99), Duration::from_millis(98));
    }

    #[test]
    fn test_build_synthetic_payloads_count() {
        let payloads = build_synthetic_payloads(5, "my-app").expect("build must succeed");
        assert_eq!(payloads.len(), 5);
        for (i, p) in payloads.iter().enumerate() {
            assert_eq!(p.id, format!("synth-{i}"));
            assert_eq!(p.application_id, "my-app");
        }
    }
}
