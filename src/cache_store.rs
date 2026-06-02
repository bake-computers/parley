//! Game-aware stats cache abstraction.
//!
//! `StatsCacheStore` is the layer consulted by the stats RPC handler. Its
//! contract:
//!
//!   1. **Fast path.** If a fresh-enough cached copy exists, return it without
//!      calling upstream.
//!   2. **Cold miss.** Coalesce concurrent misses for the same key via
//!      single-flight, call the appropriate `StatsBackend`, cache the
//!      result, return.
//!   3. **Graceful degradation.** When the backend returns `GcUnavailable`,
//!      callers may optionally fall back to a longer-TTL stale snapshot.
//!      The in-memory impl here doesn't implement stale-grace (no snapshots
//!      past TTL); the Postgres impl in `engine-service` does.

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use tokio::sync::{Mutex, watch};

use crate::backends::{Game, StatsBackendRegistry};
use crate::fetch::{StatsFetchError, StatsPlatform};
use crate::scrape::{ScrapedStats, ScrapedStatsCollection};

/// Per-game TTLs + stale-grace window (used by Postgres store).
#[derive(Debug, Clone)]
pub struct StatsCacheConfigV2 {
    pub ttl_r6: Duration,
    pub stale_grace: Duration,
    pub in_memory_max_entries: usize,
}

impl Default for StatsCacheConfigV2 {
    fn default() -> Self {
        Self {
            ttl_r6: Duration::from_secs(60),
            stale_grace: Duration::from_secs(24 * 3600),
            in_memory_max_entries: 1024,
        }
    }
}

impl StatsCacheConfigV2 {
    pub fn ttl_for(&self, game: Game) -> Duration {
        match game {
            Game::R6 => self.ttl_r6,
        }
    }
}

/// What the handler receives for a single `FetchStats` request.
#[derive(Debug, Clone)]
pub struct CachedStats {
    pub stats: ScrapedStats,
    /// Set when a backend call failed with `GcUnavailable` and we served
    /// a stale snapshot from the grace window instead.
    pub degraded: bool,
}

/// Game-aware cache-or-fetch facade.
#[async_trait]
pub trait StatsCacheStore: Send + Sync {
    async fn fetch(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Result<CachedStats, StatsFetchError>;

    async fn fetch_collection(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError>;
}

// ======================================================================
// SingleFlight — coalesce concurrent misses for the same key.
// ======================================================================

/// A minimal, request-bounded single-flight group. Each key's result is
/// shared across all awaiting callers via a `watch` channel; once the
/// leader publishes the result, every follower wakes up at once.
pub struct SingleFlight<K, V>
where
    K: Eq + Hash + Clone,
    V: Clone,
{
    cells: Mutex<HashMap<K, Arc<watch::Sender<Option<V>>>>>,
}

impl<K, V> Default for SingleFlight<K, V>
where
    K: Eq + Hash + Clone,
    V: Clone,
{
    fn default() -> Self {
        Self {
            cells: Mutex::new(HashMap::new()),
        }
    }
}

impl<K, V> SingleFlight<K, V>
where
    K: Eq + Hash + Clone,
    V: Clone,
{
    pub fn new() -> Self {
        Self::default()
    }

    /// Run `f()` exactly once per concurrent group of callers using `key`.
    pub async fn do_or_wait<F, Fut>(&self, key: K, f: F) -> V
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = V>,
    {
        let (sender, leader) = {
            let mut cells = self.cells.lock().await;
            if let Some(s) = cells.get(&key) {
                (s.clone(), false)
            } else {
                let (tx, _rx) = watch::channel::<Option<V>>(None);
                let tx = Arc::new(tx);
                cells.insert(key.clone(), tx.clone());
                (tx, true)
            }
        };

        if leader {
            let value = f().await;
            let _ = sender.send(Some(value.clone()));
            self.cells.lock().await.remove(&key);
            value
        } else {
            let mut rx = sender.subscribe();
            // If leader already completed, the initial borrow shows the result.
            if let Some(v) = rx.borrow().clone() {
                return v;
            }
            // Otherwise wait for the leader's publish.
            rx.wait_for(|v| v.is_some())
                .await
                .ok()
                .and_then(|g| g.clone())
                .expect("single-flight leader sent result")
        }
    }
}

// ======================================================================
// InMemoryStatsCacheStore — reference implementation for tests/dev.
// ======================================================================

type InMemKey = (Game, String, StatsPlatform, Option<String>);

pub struct InMemoryStatsCacheStore {
    registry: Arc<StatsBackendRegistry>,
    entries: Mutex<HashMap<InMemKey, (Instant, ScrapedStats)>>,
    cfg: StatsCacheConfigV2,
    flight: SingleFlight<InMemKey, Arc<Result<ScrapedStats, StatsFetchError>>>,
}

impl InMemoryStatsCacheStore {
    pub fn new(registry: Arc<StatsBackendRegistry>, cfg: StatsCacheConfigV2) -> Self {
        Self {
            registry,
            entries: Mutex::new(HashMap::new()),
            cfg,
            flight: SingleFlight::new(),
        }
    }
}

#[async_trait]
impl StatsCacheStore for InMemoryStatsCacheStore {
    async fn fetch(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Result<CachedStats, StatsFetchError> {
        let key = (
            game,
            username.trim().to_ascii_lowercase(),
            platform,
            season.map(|s| s.to_string()),
        );

        // Fast path.
        if let Some(stats) = {
            let entries = self.entries.lock().await;
            entries
                .get(&key)
                .filter(|(exp, _)| *exp > Instant::now())
                .map(|(_, v)| v.clone())
        } {
            return Ok(CachedStats {
                stats,
                degraded: false,
            });
        }

        // Cold miss — coalesce.
        let registry = self.registry.clone();
        let (game_c, user_c, plat_c, seas_c) = (
            game,
            username.to_string(),
            platform,
            season.map(|s| s.to_string()),
        );
        let result = self
            .flight
            .do_or_wait(key.clone(), move || async move {
                Arc::new(
                    registry
                        .fetch(game_c, &user_c, plat_c, seas_c.as_deref())
                        .await,
                )
            })
            .await;

        match &*result {
            Ok(stats) => {
                let expires_at = Instant::now() + self.cfg.ttl_for(game);
                let mut entries = self.entries.lock().await;
                if entries.len() >= self.cfg.in_memory_max_entries {
                    // Evict anything already past its TTL.
                    let now = Instant::now();
                    entries.retain(|_, (exp, _)| *exp > now);
                }
                entries.insert(key, (expires_at, stats.clone()));
                Ok(CachedStats {
                    stats: stats.clone(),
                    degraded: false,
                })
            }
            Err(e) => Err(StatsFetchError {
                kind: e.kind.clone(),
                message: e.message.clone(),
                retryable: e.retryable,
                status: e.status,
                requested_season: e.requested_season.clone(),
                available_seasons: e.available_seasons.clone(),
            }),
        }
    }

    async fn fetch_collection(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError> {
        self.registry
            .fetch_collection(game, username, platform)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn single_flight_coalesces_concurrent_work_for_same_key() {
        let sf: SingleFlight<&'static str, usize> = SingleFlight::new();
        let counter = Arc::new(AtomicUsize::new(0));

        // 50 concurrent callers for the same key should invoke the closure once.
        let mut handles = Vec::new();
        for _ in 0..50 {
            let sf = &sf;
            let counter = counter.clone();
            handles.push(async move {
                sf.do_or_wait("k", move || async move {
                    tokio::time::sleep(std::time::Duration::from_millis(25)).await;
                    counter.fetch_add(1, Ordering::SeqCst);
                    42_usize
                })
                .await
            });
        }
        let results = futures_util::future::join_all(handles).await;
        assert!(results.iter().all(|v| *v == 42));
        assert_eq!(
            counter.load(Ordering::SeqCst),
            1,
            "closure ran exactly once"
        );
    }

    #[tokio::test]
    async fn single_flight_runs_separately_for_different_keys() {
        let sf: SingleFlight<&'static str, u32> = SingleFlight::new();
        let counter = Arc::new(AtomicUsize::new(0));

        let a = {
            let c = counter.clone();
            sf.do_or_wait("a", move || async move {
                c.fetch_add(1, Ordering::SeqCst);
                1
            })
        };
        let b = {
            let c = counter.clone();
            sf.do_or_wait("b", move || async move {
                c.fetch_add(1, Ordering::SeqCst);
                2
            })
        };
        let (ra, rb) = tokio::join!(a, b);
        assert_eq!(ra, 1);
        assert_eq!(rb, 2);
        assert_eq!(counter.load(Ordering::SeqCst), 2);
    }
}
