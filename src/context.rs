use std::sync::Arc;
use std::time::Duration;

use crate::backends::StatsBackendRegistry;
use crate::backends::r6::R6Backend;
use crate::cache_redis::RedisStatsCacheStore;
use crate::cache_store::{StatsCacheConfigV2, StatsCacheStore};
use crate::fetch::StatsClient;
use crate::leaderboard::LeaderboardStore;

use crate::db::pool::{self, DbPool, PoolConfig};
use crate::handlers::stats::StatsHandler;
use crate::logging::AxiomLogger;

#[derive(Clone)]
pub struct AppContext {
    pub pool: Option<DbPool>,
    pub stats: Arc<StatsHandler>,
    pub axiom: AxiomLogger,
    pub leaderboard: Option<Arc<LeaderboardStore>>,
}

impl AppContext {
    pub async fn from_env(axiom: AxiomLogger) -> anyhow::Result<Self> {
        let client = StatsClient::default();

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
            tracing::warn!("DATABASE_URL not set — running in DB-less degraded mode");
            None
        };

        let cache_cfg = cache_config_from_env();
        let (stats, leaderboard) =
            if let Some(redis_url) = std::env::var("REDIS_URL").ok().filter(|s| !s.is_empty()) {
                let redis_client = redis::Client::open(redis_url.as_str())
                    .map_err(|e| anyhow::anyhow!("redis: {e}"))?;
                let conn = redis::aio::ConnectionManager::new(redis_client)
                    .await
                    .map_err(|e| anyhow::anyhow!("redis connect: {e}"))?;
                tracing::info!("redis connected for stats cache + leaderboard");

                let lb = Arc::new(LeaderboardStore::new(conn.clone()));
                let store: Arc<dyn StatsCacheStore> = Arc::new(RedisStatsCacheStore::new(
                    conn,
                    registry.clone(),
                    cache_cfg,
                    Some(lb.clone()),
                ));
                (
                    Arc::new(
                        StatsHandler::with_client(client)
                            .with_registry(registry)
                            .with_cache_store(store),
                    ),
                    Some(lb),
                )
            } else {
                tracing::warn!("REDIS_URL not set — running without cache store");
                (
                    Arc::new(StatsHandler::with_client(client).with_registry(registry)),
                    None,
                )
            };

        Ok(Self {
            pool,
            stats,
            axiom,
            leaderboard,
        })
    }

    pub fn in_memory_for_tests() -> Self {
        Self {
            pool: None,
            stats: Arc::new(StatsHandler::default()),
            axiom: AxiomLogger::default(),
            leaderboard: None,
        }
    }

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
    }
}

fn read_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}
