//! Siphon worker pool and recursive crawl engine.
//!
//! A [`SiphonWorker`] consumes [`SiphonCommand`]s from a shared MPSC channel,
//! checks each UID against a [`Hull`] bloom filter for deduplication, fetches
//! stats via a pluggable [`StatsFetcher`], and recursively queues discovered
//! UIDs back onto the same channel (subject to `max_depth`).
//!
//! ## Worker lifecycle
//!
//! * Each worker owns its own [`Sender`] clone, so recursion doesn't have to
//!   serialise on a shared mutex.
//! * Workers compete for commands via `Arc<Mutex<Receiver>>`. The lock is held
//!   only for the `recv()` / `try_recv()` call so other workers can proceed
//!   concurrently with their fetches.
//! * On [`SiphonCommand::Terminate`] a worker switches to drain mode: it keeps
//!   its sender alive, processes remaining channel items via `try_recv()`, and
//!   exits when the channel is empty *and* no workers are actively fetching.
//! * The coordinator sends one Terminate per worker so every worker eventually
//!   leaves the blocking `recv()` and reaches drain mode. Once a worker exits
//!   `run`, its `Sender` clone drops; when all workers and the coordinator's
//!   sender are dropped, the channel closes naturally.

use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc::error::TryRecvError;
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

/// Result of spawning a worker pool: a [`tokio::task::JoinSet`] of worker
/// futures, the coordinator-side [`Sender`] used to seed the crawl, and the
/// global termination flag.
pub type WorkerSpawnResult = (
    tokio::task::JoinSet<Vec<SiphonResult>>,
    Sender<SiphonCommand>,
    Arc<AtomicBool>,
);

/// How long a drain worker sleeps before re-checking the channel when the
/// queue is briefly empty but other workers are still fetching.
const DRAIN_BACKOFF: Duration = Duration::from_millis(50);

/// A worker that participates in the shared Siphon crawl pool.
pub struct SiphonWorker {
    hull: Arc<Hull>,
    config: CrawlConfig,
    active: Arc<AtomicU64>,
    /// Global flag set by the coordinator to signal that workers should drain
    /// and exit. Acts as a safety net when Terminate messages are consumed by
    /// drain workers before a main-mode worker receives one.
    terminate: Arc<AtomicBool>,
    /// The worker's own [`Sender`] clone, used to enqueue children discovered
    /// during recursion. Dropped automatically when [`run`](Self::run)
    /// returns.
    tx: Sender<SiphonCommand>,
}

impl SiphonWorker {
    pub fn new(
        hull: Arc<Hull>,
        config: CrawlConfig,
        active: Arc<AtomicU64>,
        terminate: Arc<AtomicBool>,
        tx: Sender<SiphonCommand>,
    ) -> Self {
        Self {
            hull,
            config,
            active,
            terminate,
            tx,
        }
    }

    /// Run the worker loop.
    ///
    /// Operates in two modes:
    /// * **Main mode** — block on `recv().await` and dispatch commands. A
    ///   [`SiphonCommand::Terminate`] flips the worker into drain mode.
    /// * **Drain mode** — poll the channel via `try_recv()`. Drain workers
    ///   keep processing crawls (so recursion still happens during shutdown)
    ///   and only exit when the channel is empty and no other worker is
    ///   actively fetching, or when the channel disconnects.
    pub async fn run(
        self,
        rx: Arc<Mutex<Receiver<SiphonCommand>>>,
        fetcher: StatsFetcher,
    ) -> Vec<SiphonResult> {
        let SiphonWorker {
            hull,
            config,
            active,
            terminate,
            tx,
        } = self;
        let mut results: Vec<SiphonResult> = Vec::new();
        let mut terminating = false;

        loop {
            if terminating {
                let outcome = {
                    let mut guard = rx.lock().await;
                    guard.try_recv()
                };
                match outcome {
                    Ok(SiphonCommand::Crawl { uid, depth }) => {
                        let result = process_crawl(
                            &uid,
                            depth,
                            &hull,
                            &config,
                            Some(&tx),
                            &fetcher,
                            &active,
                        )
                        .await;
                        results.push(result);
                    }
                    Ok(SiphonCommand::Terminate) => {}
                    Err(TryRecvError::Empty) => {
                        if active.load(Ordering::SeqCst) == 0 {
                            break;
                        }
                        tokio::time::sleep(DRAIN_BACKOFF).await;
                    }
                    Err(TryRecvError::Disconnected) => break,
                }
            } else {
                // Check the global termination flag before blocking on recv.
                // This prevents a worker from being stranded in main mode when
                // drain workers consume all Terminate messages.
                if terminate.load(Ordering::SeqCst) {
                    terminating = true;
                    continue;
                }
                let cmd = {
                    let mut guard = rx.lock().await;
                    guard.recv().await
                };
                match cmd {
                    Some(SiphonCommand::Crawl { uid, depth }) => {
                        let result = process_crawl(
                            &uid,
                            depth,
                            &hull,
                            &config,
                            Some(&tx),
                            &fetcher,
                            &active,
                        )
                        .await;
                        results.push(result);
                    }
                    Some(SiphonCommand::Terminate) => {
                        terminating = true;
                    }
                    None => break,
                }
            }
            tokio::task::yield_now().await;
        }

        // Dropping `tx` here decrements the channel's sender count. When
        // every worker has exited and the coordinator has dropped its own
        // sender, the channel closes for any worker still parked in
        // `recv().await`.
        drop(tx);

        results
    }

    /// Spawn `n` workers sharing one MPSC channel.
    ///
    /// Returns a [`tokio::task::JoinSet`] of worker futures (each returns its
    /// collected [`SiphonResult`]s) and the coordinator-side [`Sender`] used
    /// to seed the crawl.
    ///
    /// To shut the pool down, send `n` [`SiphonCommand::Terminate`]s (one per
    /// worker) so every worker reaches its drain phase, then drop the
    /// coordinator sender. The drain phase finishes once the channel is
    /// empty and no fetches are in flight.
    pub fn spawn_workers(
        n: usize,
        hull: Arc<Hull>,
        config: CrawlConfig,
        fetcher: StatsFetcher,
    ) -> WorkerSpawnResult {
        assert!(n > 0, "must spawn at least one worker");

        let (tx, rx) = tokio::sync::mpsc::channel::<SiphonCommand>(config.channel_capacity);
        let rx = Arc::new(Mutex::new(rx));
        let active = Arc::new(AtomicU64::new(0));
        let terminate = Arc::new(AtomicBool::new(false));
        let mut joinset = tokio::task::JoinSet::new();

        for _ in 0..n {
            let worker = SiphonWorker::new(
                Arc::clone(&hull),
                config.clone(),
                Arc::clone(&active),
                Arc::clone(&terminate),
                tx.clone(),
            );
            let rx = Arc::clone(&rx);
            let fetcher = fetcher.clone();
            joinset.spawn(async move { worker.run(rx, fetcher).await });
        }

        (joinset, tx, terminate)
    }
}

/// Core recursive crawl logic executed inside a worker loop.
///
/// 1. Check the bloom filter via [`Hull::check_or_insert`] — if the UID has
///    already been seen, return early with an empty discovered set.
/// 2. Fetch stats for the UID via the pluggable [`StatsFetcher`].
/// 3. For each discovered UID where `depth + 1 < max_depth`, send a new
///    [`SiphonCommand::Crawl`] back to the shared channel.
/// 4. Return a [`SiphonResult`] summarising what was queued.
///
/// `active` is incremented before the fetch and decremented only **after**
/// every child has been queued. This gives drain workers a reliable
/// "in-flight work" signal — if a drain worker observes both an empty queue
/// and `active == 0`, it can be sure no more items will appear.
async fn process_crawl(
    uid: &str,
    depth: usize,
    hull: &Arc<Hull>,
    config: &CrawlConfig,
    tx: Option<&Sender<SiphonCommand>>,
    fetcher: &StatsFetcher,
    active: &Arc<AtomicU64>,
) -> SiphonResult {
    if hull.check_or_insert(uid) {
        return SiphonResult {
            uid: uid.to_string(),
            depth,
            discovered_uids: Vec::new(),
            stats: None,
        };
    }

    active.fetch_add(1, Ordering::SeqCst);
    let discovered = fetcher(uid).await.unwrap_or_default();

    let mut queued: Vec<String> = Vec::new();
    if depth + 1 < config.max_depth {
        if let Some(tx) = tx {
            for discovered_uid in &discovered {
                if hull.contains(discovered_uid) {
                    continue;
                }
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
    // Decrement only after every child has been pushed onto the channel so a
    // drain worker can never observe a transient "queue empty + active == 0"
    // window between fetcher completion and child enqueue.
    active.fetch_sub(1, Ordering::SeqCst);

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
    async fn drive_worker(
        hull: Arc<Hull>,
        config: CrawlConfig,
        fetcher: StatsFetcher,
        seeds: Vec<SiphonCommand>,
    ) -> Vec<SiphonResult> {
        let (tx, rx) = tokio::sync::mpsc::channel::<SiphonCommand>(config.channel_capacity);
        let rx = Arc::new(Mutex::new(rx));
        let active = Arc::new(AtomicU64::new(0));

        for cmd in seeds {
            tx.send(cmd).await.expect("seed send");
        }
        tx.send(SiphonCommand::Terminate)
            .await
            .expect("terminate send");

        let worker = SiphonWorker::new(
            hull,
            config,
            active,
            Arc::new(AtomicBool::new(false)),
            tx.clone(),
        );
        let handle = tokio::spawn(async move { worker.run(rx, fetcher).await });

        // Drop the coordinator sender so the channel can close once the
        // worker drops its own clone on exit.
        drop(tx);

        handle.await.expect("worker task panicked")
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

        // max_depth=3, fetcher returns [A, B] for every UID.
        // depth 0: seed crawls, discovers A,B. Enqueues A@1, B@1.
        // depth 1: A crawls, discovers A,B. A already in bloom → skip. B not
        //   yet crawled at this point → enqueues B@2.
        // depth 1: B crawls, discovers A,B. Both already in bloom → skip.
        // depth 2: B bloom-skipped (already crawled at depth 1).
        // Total: seed + A@1 + B@1 + B@2(bloom-skip) = 4.
        assert_eq!(results.len(), 4, "got {results:?}");

        let seed = results.iter().find(|r| r.uid == "seed-uid").unwrap();
        assert_eq!(seed.depth, 0);
        assert_eq!(seed.discovered_uids, vec!["uid-A", "uid-B"]);
        assert!(seed.stats.is_none());

        let a = results
            .iter()
            .find(|r| r.uid == "uid-A" && r.depth == 1)
            .unwrap();
        assert_eq!(
            a.discovered_uids,
            vec!["uid-B"],
            "A@1 discovers [A,B]; A already in bloom (skip), B not yet crawled (enqueue)"
        );

        let b = results
            .iter()
            .find(|r| r.uid == "uid-B" && r.depth == 1)
            .unwrap();
        assert!(
            b.discovered_uids.is_empty(),
            "B@1 discovers [A,B]; both already in bloom (skip all)"
        );

        let b2 = results
            .iter()
            .find(|r| r.uid == "uid-B" && r.depth == 2)
            .unwrap();
        assert!(b2.discovered_uids.is_empty());
        assert!(b2.stats.is_none());
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

        assert_eq!(results.len(), 2, "expected 2 results, got {results:?}");

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

        let (mut joinset, tx, _terminate) =
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
    async fn test_recursive_discovery_concurrent_pool() {
        // Verifies multiple workers actually cooperate on a deep crawl rather
        // than serialising through the old shared_tx mutex.
        let hull = Arc::new(Hull::default());
        let config = CrawlConfig {
            max_depth: 5,
            channel_capacity: 64,
            ..default_config()
        };

        // Each crawl returns two children; bloom dedup keeps the search
        // tree finite.
        let fetcher: StatsFetcher = Arc::new(move |uid: &str| {
            let a = format!("{uid}-a");
            let b = format!("{uid}-b");
            Box::pin(async move { Ok(vec![a, b]) })
        });

        const WORKERS: usize = 4;
        let (mut joinset, tx, terminate_flag) =
            SiphonWorker::spawn_workers(WORKERS, hull, config, fetcher);

        tx.send(SiphonCommand::Crawl {
            uid: "seed".into(),
            depth: 0,
        })
        .await
        .expect("seed send");

        for _ in 0..WORKERS {
            tx.send(SiphonCommand::Terminate)
                .await
                .expect("terminate send");
        }
        drop(tx);
        // Signal the global termination flag so any worker still in main
        // mode (racing ahead of Terminate messages) will enter drain mode.
        terminate_flag.store(true, Ordering::SeqCst);

        let mut all_results: Vec<SiphonResult> = Vec::new();
        while let Some(Ok(task_results)) = joinset.join_next().await {
            all_results.extend(task_results);
        }

        // With max_depth=5 and a binary tree, expect 1 + 2 + 4 + 8 + 16 = 31
        // unique uids visited (depth 0..=4). depth 5+ never enters
        // process_crawl because process_crawl at depth 4 has
        // depth+1=5 == max_depth, so it doesn't enqueue.
        assert_eq!(all_results.len(), 31, "got {} results", all_results.len());

        // Depths 0..=4 should all be represented.
        let mut depths_seen: std::collections::BTreeSet<usize> =
            all_results.iter().map(|r| r.depth).collect();
        let depths_vec: Vec<usize> = depths_seen.iter().copied().collect();
        assert_eq!(depths_vec, vec![0, 1, 2, 3, 4]);
        depths_seen.clear();
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
        let (mut joinset, tx, _terminate) =
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
