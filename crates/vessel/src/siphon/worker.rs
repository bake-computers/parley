//! Siphon worker pool and recursive crawl engine.
//!
//! A [`SiphonWorker`] consumes [`SiphonCommand`]s from a shared MPSC channel,
//! checks each UID against a [`Hull`] bloom filter for deduplication, fetches
//! stats via a pluggable [`StatsFetcher`], and recursively queues discovered
//! UIDs back onto the same channel (subject to `max_depth`).
//!
//! ## Worker lifecycle
//!
//! * Workers compete for commands via `Arc<Mutex<Receiver>>`. The lock is held
//!   only for the `recv()` call so other workers can proceed concurrently.
//! * On [`SiphonCommand::Terminate`] the worker enters a drain phase: it keeps
//!   its sender alive, processes remaining channel items via `try_recv()`, and
//!   exits when the channel is empty and disconnected.
//! * The coordinator sends one Terminate per worker to shut the pool down.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::Mutex;

use crate::hull::Hull;
use crate::siphon::channel::{CrawlConfig, SiphonCommand, SiphonResult};

/// Pluggable async stats fetcher.
///
/// Takes a UID string and returns a list of discovered UIDs (e.g. teammates,
/// opponents found on a stats page). Mock implementations avoid real HTTP
/// requests in tests.
pub type StatsFetcher = Arc<
    dyn Fn(&str) -> Pin<Box<dyn Future<Output = Result<Vec<String>, String>> + Send>> + Send + Sync,
>;

/// Result of spawning a worker pool: JoinSet of worker tasks, the sender
/// for submitting commands, and a shared sender reference for termination.
pub type WorkerSpawnResult = (
    tokio::task::JoinSet<Vec<SiphonResult>>,
    Sender<SiphonCommand>,
    Arc<Mutex<Option<Sender<SiphonCommand>>>>,
);

/// A worker that participates in the shared Siphon crawl pool.
pub struct SiphonWorker {
    hull: Arc<Hull>,
    config: CrawlConfig,
}

impl SiphonWorker {
    /// Create a new worker handle.
    ///
    /// The caller provides the shared channel endpoints and a [`StatsFetcher`]
    /// when calling [`run`].
    pub fn new(hull: Arc<Hull>, config: CrawlConfig) -> Self {
        Self { hull, config }
    }

    /// Run the worker loop.
    ///
    /// The worker momentarily releases its sender clone before each `recv()`
    /// call so the channel can close when no external senders remain.
    ///
    /// When [`SiphonCommand::Terminate`] is received the worker enters a drain
    /// phase that consumes remaining items via `try_recv()`. If another
    /// Terminate is encountered during drain, draining stops immediately so
    /// other workers can receive their own shutdown signal.
    pub async fn run(
        &mut self,
        rx: Arc<Mutex<Receiver<SiphonCommand>>>,
        shared_tx: Arc<tokio::sync::Mutex<Option<Sender<SiphonCommand>>>>,
        fetcher: StatsFetcher,
    ) -> Vec<SiphonResult> {
        let mut results: Vec<SiphonResult> = Vec::new();

        loop {
            let cmd = {
                let mut guard = rx.lock().await;
                guard.recv().await
            };

            match cmd {
                Some(SiphonCommand::Terminate) => {
                    drain_channel(
                        &self.hull,
                        &self.config,
                        &shared_tx,
                        &fetcher,
                        &rx,
                        &mut results,
                    )
                    .await;
                    break;
                }
                Some(SiphonCommand::Crawl { uid, depth }) => {
                    let result = {
                        let guard = shared_tx.lock().await;
                        process_crawl(
                            &uid,
                            depth,
                            &self.hull,
                            &self.config,
                            guard.as_ref(),
                            &fetcher,
                        )
                        .await
                    };
                    results.push(result);
                    tokio::task::yield_now().await;
                }
                None => break,
            }
        }

        results
    }

    /// Spawn `n` workers sharing one MPSC channel.
    ///
    /// Returns a [`tokio::task::JoinSet`] of worker futures (each returns its
    /// collected [`SiphonResult`]s) and a [`Sender`] the coordinator uses to
    /// seed the crawl.
    ///
    /// To stop the pool, send `n` [`SiphonCommand::Terminate`] commands (one
    /// per worker). Alternatively, drop all sender clones to close the channel.
    pub fn spawn_workers(
        n: usize,
        hull: Arc<Hull>,
        config: CrawlConfig,
        fetcher: StatsFetcher,
    ) -> WorkerSpawnResult {
        assert!(n > 0, "must spawn at least one worker");

        let (tx, rx) = tokio::sync::mpsc::channel::<SiphonCommand>(config.channel_capacity);
        let rx = Arc::new(Mutex::new(rx));
        let shared_tx = Arc::new(tokio::sync::Mutex::new(Some(tx.clone())));
        let mut joinset = tokio::task::JoinSet::new();

        for _ in 0..n {
            let mut worker = SiphonWorker::new(Arc::clone(&hull), config.clone());
            let rx = Arc::clone(&rx);
            let shared_tx = Arc::clone(&shared_tx);
            let fetcher = fetcher.clone();
            joinset.spawn(async move { worker.run(rx, shared_tx, fetcher).await });
        }

        (joinset, tx, shared_tx)
    }
}

/// Drain the shared channel after receiving Terminate.
///
/// Uses `try_recv()` so other workers can still acquire the lock. If another
/// Terminate is encountered, draining stops — it belongs to a different worker.
async fn drain_channel(
    hull: &Arc<Hull>,
    config: &CrawlConfig,
    shared_tx: &Arc<tokio::sync::Mutex<Option<Sender<SiphonCommand>>>>,
    fetcher: &StatsFetcher,
    rx: &Arc<Mutex<Receiver<SiphonCommand>>>,
    results: &mut Vec<SiphonResult>,
) {
    loop {
        let cmd = {
            let mut guard = rx.lock().await;
            guard.try_recv().ok()
        };
        match cmd {
            Some(SiphonCommand::Crawl { uid, depth }) => {
                let result = {
                    let guard = shared_tx.lock().await;
                    process_crawl(uid.as_str(), depth, hull, config, guard.as_ref(), fetcher).await
                };
                results.push(result);
            }
            Some(SiphonCommand::Terminate) => break,
            None => break,
        }
        tokio::task::yield_now().await;
    }
    let mut guard = shared_tx.lock().await;
    *guard = None;
}

/// Core recursive crawl logic executed inside a worker loop.
///
/// 1. Check the bloom filter via [`Hull::check_or_insert`] — if the UID has
///    already been seen, return early with an empty discovered set.
/// 2. Fetch stats for the UID via the pluggable [`StatsFetcher`].
/// 3. For each discovered UID where `depth + 1 < max_depth`, send a new
///    [`SiphonCommand::Crawl`] back to the shared channel.
/// 4. Return a [`SiphonResult`] summarising what was found.
async fn process_crawl(
    uid: &str,
    depth: usize,
    hull: &Arc<Hull>,
    config: &CrawlConfig,
    tx: Option<&Sender<SiphonCommand>>,
    fetcher: &StatsFetcher,
) -> SiphonResult {
    if hull.check_or_insert(uid) {
        return SiphonResult {
            uid: uid.to_string(),
            depth,
            discovered_uids: Vec::new(),
            stats: None,
        };
    }

    let discovered = fetcher(uid).await.unwrap_or_default();

    let mut queued: Vec<String> = Vec::new();
    if depth + 1 < config.max_depth {
        if let Some(tx) = tx {
            for discovered_uid in &discovered {
                let cmd = SiphonCommand::Crawl {
                    uid: discovered_uid.clone(),
                    depth: depth + 1,
                };
                if tx.send(cmd).await.is_ok() {
                    queued.push(discovered_uid.clone());
                }
            }
        }
    }

    SiphonResult {
        uid: uid.to_string(),
        depth,
        discovered_uids: queued,
        stats: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn default_config() -> CrawlConfig {
        CrawlConfig {
            max_depth: 3,
            platform: stats_scraper::fetch::StatsPlatform::Pc,
            channel_capacity: 64,
            rate_limit_per_second: 10,
            retry_policy: stats_scraper::fetch::RetryPolicy::none(),
        }
    }

    /// Mock that always returns the given UID list.
    fn mock_fetcher(uids: Vec<String>) -> StatsFetcher {
        Arc::new(move |_uid: &str| {
            let uids = uids.clone();
            Box::pin(async move { Ok(uids) })
        })
    }

    /// Mock that increments `counter` on each call, then returns `uids`.
    fn counting_fetcher(uids: Vec<String>, counter: Arc<AtomicU32>) -> StatsFetcher {
        Arc::new(move |_uid: &str| {
            counter.fetch_add(1, Ordering::SeqCst);
            let uids = uids.clone();
            Box::pin(async move { Ok(uids) })
        })
    }

    /// Drive a single worker: send `seeds` then one Terminate, collect results.
    /// The coordinator keeps its sender alive so the worker's drain phase can
    /// complete (channel stays open until the worker finishes draining).
    async fn drive_worker(
        hull: Arc<Hull>,
        config: CrawlConfig,
        fetcher: StatsFetcher,
        seeds: Vec<SiphonCommand>,
    ) -> Vec<SiphonResult> {
        let (tx, rx) = tokio::sync::mpsc::channel::<SiphonCommand>(config.channel_capacity);
        let rx = Arc::new(Mutex::new(rx));
        let shared_tx = Arc::new(tokio::sync::Mutex::new(Some(tx.clone())));

        for cmd in seeds {
            tx.send(cmd).await.expect("seed send");
        }
        tx.send(SiphonCommand::Terminate)
            .await
            .expect("terminate send");

        let mut worker = SiphonWorker::new(hull, config);
        let handle = tokio::spawn(async move { worker.run(rx, shared_tx, fetcher).await });

        let results = handle.await.expect("worker task panicked");
        drop(tx);
        results
    }

    #[tokio::test]
    async fn test_single_crawl_cycle() {
        let hull = Arc::new(Hull::default());
        let fetcher = mock_fetcher(vec!["uid-A".into(), "uid-B".into()]);

        let results = drive_worker(
            hull,
            default_config(),
            fetcher,
            vec![SiphonCommand::Crawl {
                uid: "seed-uid".into(),
                depth: 0,
            }],
        )
        .await;

        // max_depth=3, fetcher returns [A, B]: depth0 seeds A,B → depth1 A,B each return [C,D],[E,F] → depth2 C,D,E,F hit cap
        assert_eq!(results.len(), 7);

        let uids: Vec<&str> = results.iter().map(|r| r.uid.as_str()).collect();
        assert!(uids.contains(&"seed-uid"), "seed must be in results");
        assert!(uids.contains(&"uid-A"), "uid-A must be in results");
        assert!(uids.contains(&"uid-B"), "uid-B must be in results");

        let seed = results.iter().find(|r| r.uid == "seed-uid").unwrap();
        assert_eq!(seed.depth, 0);
        assert_eq!(seed.discovered_uids, vec!["uid-A", "uid-B"]);
        assert!(seed.stats.is_none());
    }

    #[tokio::test]
    async fn test_depth_limit() {
        let hull = Arc::new(Hull::default());
        let config = CrawlConfig {
            max_depth: 2,
            ..default_config()
        };
        let fetcher = mock_fetcher(vec!["uid-X".into()]);

        let results = drive_worker(
            hull,
            config,
            fetcher,
            vec![SiphonCommand::Crawl {
                uid: "seed".into(),
                depth: 0,
            }],
        )
        .await;

        assert_eq!(results.len(), 2, "expected 2 results, got {:?}", results);

        let seed = results.iter().find(|r| r.uid == "seed").unwrap();
        assert_eq!(seed.depth, 0);
        assert_eq!(seed.discovered_uids, vec!["uid-X"]);

        let level1 = results.iter().find(|r| r.uid == "uid-X").unwrap();
        assert_eq!(level1.depth, 1);
        assert!(
            level1.discovered_uids.is_empty(),
            "depth 2 should not be queued"
        );
    }

    #[tokio::test]
    async fn test_bloom_skip() {
        let hull = Arc::new(Hull::default());
        hull.check_or_insert("known-uid");

        let call_count = Arc::new(AtomicU32::new(0));
        let fetcher = counting_fetcher(vec!["dummy".into()], Arc::clone(&call_count));

        let results = drive_worker(
            hull,
            default_config(),
            fetcher,
            vec![SiphonCommand::Crawl {
                uid: "known-uid".into(),
                depth: 0,
            }],
        )
        .await;

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].uid, "known-uid");
        assert!(results[0].discovered_uids.is_empty());
        assert_eq!(
            call_count.load(Ordering::SeqCst),
            0,
            "fetcher must not be called"
        );
    }

    #[tokio::test]
    async fn test_terminate_drains() {
        let hull = Arc::new(Hull::default());
        let fetcher = mock_fetcher(Vec::new());

        let seeds: Vec<SiphonCommand> = (0..3)
            .map(|i| SiphonCommand::Crawl {
                uid: format!("uid-{i}"),
                depth: 0,
            })
            .collect();

        let results = drive_worker(hull, default_config(), fetcher, seeds).await;

        assert_eq!(results.len(), 3);
        let mut uids: Vec<String> = results.iter().map(|r| r.uid.clone()).collect();
        uids.sort();
        assert_eq!(uids, vec!["uid-0", "uid-1", "uid-2"]);
    }

    #[tokio::test]
    async fn test_concurrent_workers() {
        let hull = Arc::new(Hull::default());
        let config = CrawlConfig {
            channel_capacity: 64,
            ..default_config()
        };
        let fetcher = mock_fetcher(Vec::new());

        const WORKERS: usize = 4;
        const JOBS: usize = 20;

        let (mut joinset, tx, _shared_tx) =
            SiphonWorker::spawn_workers(WORKERS, hull, config, fetcher);

        for i in 0..JOBS {
            tx.send(SiphonCommand::Crawl {
                uid: format!("job-{i}"),
                depth: 0,
            })
            .await
            .expect("send job");
        }

        for _ in 0..WORKERS {
            tx.send(SiphonCommand::Terminate)
                .await
                .expect("send terminate");
        }
        drop(tx);

        let mut all_results: Vec<SiphonResult> = Vec::new();
        while let Some(Ok(task_results)) = joinset.join_next().await {
            all_results.extend(task_results);
        }

        assert_eq!(
            all_results.len(),
            JOBS,
            "all jobs must be processed exactly once"
        );

        let mut seen: Vec<String> = all_results.iter().map(|r| r.uid.clone()).collect();
        seen.sort();
        let mut expected: Vec<String> = (0..JOBS).map(|i| format!("job-{i}")).collect();
        expected.sort();
        assert_eq!(seen, expected);
    }

    #[tokio::test]
    async fn test_recursive_discovery() {
        let hull = Arc::new(Hull::default());
        let config = CrawlConfig {
            max_depth: 4,
            ..default_config()
        };

        let responses = Arc::new(vec![
            vec!["uid-1".to_string()],
            vec!["uid-2".to_string()],
            vec!["uid-3".to_string()],
        ]);
        let call_idx = Arc::new(AtomicU32::new(0));
        let fetcher: StatsFetcher = {
            let responses = Arc::clone(&responses);
            let call_idx = Arc::clone(&call_idx);
            Arc::new(move |_uid: &str| {
                let idx = call_idx.fetch_add(1, Ordering::SeqCst) as usize;
                let uids = responses.get(idx).cloned().unwrap_or_default();
                Box::pin(async move { Ok(uids) })
            })
        };

        let results = drive_worker(
            hull,
            config,
            fetcher,
            vec![SiphonCommand::Crawl {
                uid: "seed".into(),
                depth: 0,
            }],
        )
        .await;

        assert_eq!(results.len(), 4, "expected seed + 3 discovered");

        let depths: Vec<(String, usize)> =
            results.iter().map(|r| (r.uid.clone(), r.depth)).collect();
        assert!(depths.contains(&("seed".into(), 0)));
        assert!(depths.contains(&("uid-1".into(), 1)));
        assert!(depths.contains(&("uid-2".into(), 2)));
        assert!(depths.contains(&("uid-3".into(), 3)));
    }

    #[tokio::test]
    async fn test_fetch_error_graceful() {
        let hull = Arc::new(Hull::default());
        let fetcher: StatsFetcher =
            Arc::new(move |_uid: &str| Box::pin(async move { Err("network error".to_string()) }));

        let results = drive_worker(
            hull,
            default_config(),
            fetcher,
            vec![SiphonCommand::Crawl {
                uid: "error-uid".into(),
                depth: 0,
            }],
        )
        .await;

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].uid, "error-uid");
        assert!(results[0].discovered_uids.is_empty());
        assert!(results[0].stats.is_none());
    }

    #[tokio::test]
    async fn test_spawn_workers_minimum_one() {
        let hull = Arc::new(Hull::default());
        let (mut joinset, tx, _shared_tx) =
            SiphonWorker::spawn_workers(1, hull, default_config(), mock_fetcher(Vec::new()));
        tx.send(SiphonCommand::Terminate)
            .await
            .expect("send terminate");
        drop(tx);
        let results = joinset.join_next().await.unwrap().unwrap();
        assert!(
            results.is_empty(),
            "worker should exit cleanly on terminate"
        );
    }

    #[should_panic(expected = "must spawn at least one worker")]
    #[tokio::test]
    async fn test_spawn_workers_panics_on_zero() {
        SiphonWorker::spawn_workers(
            0,
            Arc::new(Hull::default()),
            default_config(),
            mock_fetcher(Vec::new()),
        );
    }
}
