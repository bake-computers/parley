//! Shared application context.

use std::sync::Arc;
use std::time::Duration;

use crate::backends::StatsBackendRegistry;
use crate::backends::r6::R6Backend;
use crate::cache_store::{StatsCacheConfigV2, StatsCacheStore};
use crate::fetch::StatsClient;

use crate::db::pool::{self, DbPool, PoolConfig};
use crate::stats_cache_store::PostgresStatsCacheStore;
use crate::handlers::stats::StatsHandler;
use crate::logging::AxiomLogger;

/// Everything the service routes need at request time.
///
/// Clone is cheap (all inner fields are Arcs or pool handles).
#[derive(Clone)]
pub struct AppContext {
    pub pool: Option<DbPool>,
    pub stats: Arc<StatsHandler>,
    pub axiom: AxiomLogger,
}

impl AppContext {
    /// Boot from environment. Reads `DATABASE_URL` (optional), runs migrations
    /// when `RUN_MIGRATIONS=1`, and constructs handlers.
    ///
    /// When a DB pool is built, a `PostgresStatsCacheStore` is also wired into
    /// the stats handler so FetchStats RPCs get DB-backed snapshot reuse with
    /// single-flight coalescing + stale-grace fallback.
    pub async fn from_env(axiom: AxiomLogger) -> anyhow::Result<Self> {
        let client = StatsClient::default();

        // Pre-warm the stats.cc TCP+TLS connection at startup so the first
        // real request doesn't pay the ~200-500ms connection handshake.
        let warmup_client = client.clone();
        tokio::spawn(async move {
            warmup_client.warmup().await;
        });
        let mut registry = StatsBackendRegistry::new();
        registry.register(Arc::new(R6Backend::new(client.clone())));

        let registry = Arc::new(registry);

        let pool = if let Some(cfg) = PoolConfig::from_env() {
            pool::run_migrations_if_requested(&cfg).await?;
            let p = pool::init_pool(&cfg).await?;
            tracing::info!(
                max_size = cfg.max_size,
                min_idle = ?cfg.min_idle,
                "db pool ready"
            );
            Some(p)
        } else {
            tracing::warn!(
                "DATABASE_URL not set — running in DB-less degraded mode; only in-memory stats work"
            );
            None
        };

        let cache_cfg = cache_config_from_env();
        let stats = if let Some(p) = pool.clone() {
            let store: Arc<dyn StatsCacheStore> = Arc::new(PostgresStatsCacheStore::new(
                p,
                registry.clone(),
                cache_cfg,
                axiom.clone(),
            ));
            Arc::new(
                StatsHandler::with_client(client)
                    .with_registry(registry)
                    .with_cache_store(store),
            )
        } else {
            Arc::new(StatsHandler::with_client(client).with_registry(registry))
        };

        Ok(Self { pool, stats, axiom })
    }

    /// Test/dev helper: no DB, default handlers.
    pub fn in_memory_for_tests() -> Self {
        Self {
            pool: None,
            stats: Arc::new(StatsHandler::default()),
            axiom: AxiomLogger::default(),
        }
    }

    /// Readiness: pool must hand out a working connection (when enabled).
    pub async fn readiness_check(&self) -> anyhow::Result<()> {
        if let Some(p) = &self.pool {
            pool::ping(p).await?;
        }
        Ok(())
    }
}

fn cache_config_from_env() -> StatsCacheConfigV2 {
    let ttl_r6 = Duration::from_millis(read_u64("STATS_TTL_R6_MS", 60_000));
    let stale_grace = Duration::from_millis(read_u64("STATS_STALE_GRACE_MS", 24 * 3600 * 1000));
    StatsCacheConfigV2 {
        ttl_r6,
        stale_grace,
        in_memory_max_entries: 1024,
    }
}

fn read_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}
