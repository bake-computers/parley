//! Bounded MPSC channel types for the Siphon crawler.
//!
//! Uses `tokio::sync::mpsc::channel` for backpressure — `Sender::send()` blocks
//! when the channel is full, ensuring no items are dropped under load.

use stats_scraper::fetch::{RetryPolicy, StatsPlatform};
use stats_scraper::scrape::ScrapedStatsCollection;
use tokio::sync::mpsc::{self, Receiver, Sender};

/// Command sent from the coordinator to crawler workers.
#[derive(Debug, Clone)]
pub enum SiphonCommand {
    /// Instruct a worker to crawl the given UID at the specified depth.
    Crawl { uid: String, depth: usize },
    /// Signal all workers to drain the queue and exit gracefully.
    Terminate,
}

/// Result produced by a crawler worker after processing a [`SiphonCommand::Crawl`].
#[derive(Debug, Clone)]
pub struct SiphonResult {
    pub uid: String,
    pub depth: usize,
    pub discovered_uids: Vec<String>,
    pub stats: Option<ScrapedStatsCollection>,
}

/// Configuration for a crawl operation.
#[derive(Debug, Clone)]
pub struct CrawlConfig {
    pub max_depth: usize,
    pub platform: StatsPlatform,
    pub channel_capacity: usize,
    pub rate_limit_per_second: u32,
    pub retry_policy: RetryPolicy,
}

/// Create a new bounded MPSC channel pair for the Siphon command protocol.
///
/// The returned `(Sender, Receiver)` use `tokio::sync::mpsc::channel(capacity)`.
/// `Sender::send()` will await (block) when the channel's buffer is full,
/// providing natural backpressure without dropping items.
pub fn create_channels(capacity: usize) -> (Sender<SiphonCommand>, Receiver<SiphonCommand>) {
    mpsc::channel(capacity)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{timeout, Duration};

    #[tokio::test]
    async fn channel_blocks_at_capacity() {
        // Channel with capacity 5
        let (tx, mut rx) = create_channels(5);

        // Fill the channel to capacity
        for i in 0..5 {
            tx.send(SiphonCommand::Crawl {
                uid: format!("uid-{i}"),
                depth: 0,
            })
            .await
            .expect("send should succeed at capacity");
        }

        // The next send should block (backpressure). We use a short timeout to verify
        // it is actually blocking rather than succeeding.
        let result = timeout(
            Duration::from_millis(100),
            tx.send(SiphonCommand::Crawl {
                uid: "uid-blocked".to_string(),
                depth: 0,
            }),
        )
        .await;

        // Expect timeout (channel is full, send is blocked)
        assert!(result.is_err(), "send should block when channel is full");

        // Receive one item, freeing up capacity
        let cmd = rx.recv().await.expect("should receive item");
        assert!(matches!(cmd, SiphonCommand::Crawl { .. }));

        // Now sending should succeed (channel has space)
        let send_result = timeout(
            Duration::from_millis(100),
            tx.send(SiphonCommand::Crawl {
                uid: "uid-unblocked".to_string(),
                depth: 0,
            }),
        )
        .await;

        assert!(
            send_result.is_ok(),
            "send should succeed after receiving one item"
        );
    }

    #[tokio::test]
    async fn terminate_drains_gracefully() {
        let (tx, mut rx) = create_channels(10);

        // Send some crawl commands
        for i in 0..5 {
            tx.send(SiphonCommand::Crawl {
                uid: format!("uid-{i}"),
                depth: 1,
            })
            .await
            .expect("send should succeed");
        }

        // Send terminate
        tx.send(SiphonCommand::Terminate)
            .await
            .expect("terminate should succeed");

        // Workers should drain all items including Terminate
        let mut received = Vec::new();
        while let Some(cmd) = rx.recv().await {
            let is_terminate = matches!(cmd, SiphonCommand::Terminate);
            received.push(cmd);
            if is_terminate {
                break;
            }
        }

        // Should have received all 5 Crawl commands plus Terminate
        assert_eq!(received.len(), 6);
        assert!(matches!(received[5], SiphonCommand::Terminate));
    }

    #[tokio::test]
    async fn concurrent_send_receive() {
        let (tx, mut rx) = create_channels(20);

        let num_tasks = 4;
        let items_per_task = 10;

        // Spawn multiple concurrent senders
        let mut handles = Vec::new();
        for t in 0..num_tasks {
            let tx = tx.clone();
            let handle = tokio::spawn(async move {
                for i in 0..items_per_task {
                    tx.send(SiphonCommand::Crawl {
                        uid: format!("task-{t}-uid-{i}"),
                        depth: t,
                    })
                    .await
                    .expect("send should succeed");
                }
            });
            handles.push(handle);
        }

        // Drop the original sender so channel closes when workers are done
        drop(tx);

        // Receive all items concurrently
        let mut received = Vec::new();
        while let Some(cmd) = rx.recv().await {
            received.push(cmd);
        }

        // Wait for all senders to complete
        for handle in handles {
            handle.await.expect("task should complete");
        }

        // Should have received all items
        let expected = num_tasks * items_per_task;
        assert_eq!(
            received.len(),
            expected,
            "should receive all {expected} items"
        );

        // Verify all UIDs are present
        let mut uid_count = 0;
        for cmd in &received {
            if let SiphonCommand::Crawl { uid, .. } = cmd {
                assert!(uid.starts_with("task-"));
                uid_count += 1;
            }
        }
        assert_eq!(uid_count, expected);
    }

    #[tokio::test]
    async fn siphon_result_contains_expected_fields() {
        let result = SiphonResult {
            uid: "test-uid".to_string(),
            depth: 3,
            discovered_uids: vec!["uid-1".to_string(), "uid-2".to_string()],
            stats: None,
        };

        assert_eq!(result.uid, "test-uid");
        assert_eq!(result.depth, 3);
        assert_eq!(result.discovered_uids.len(), 2);
        assert!(result.stats.is_none());
    }

    #[tokio::test]
    async fn crawl_config_has_expected_defaults() {
        let config = CrawlConfig {
            max_depth: 5,
            platform: StatsPlatform::Pc,
            channel_capacity: 100,
            rate_limit_per_second: 10,
            retry_policy: RetryPolicy::default(),
        };

        assert_eq!(config.max_depth, 5);
        assert_eq!(config.platform, StatsPlatform::Pc);
        assert_eq!(config.channel_capacity, 100);
        assert_eq!(config.rate_limit_per_second, 10);
        assert_eq!(config.retry_policy.max_attempts, 2);
    }
}
