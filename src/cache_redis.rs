use std::sync::Arc;

use async_trait::async_trait;
use redis::AsyncCommands;
use redis::aio::ConnectionManager;

use crate::backends::{Game, StatsBackendRegistry};
use crate::cache_store::{CachedStats, SingleFlight, StatsCacheConfigV2, StatsCacheStore};
use crate::fetch::{StatsFetchError, StatsFetchErrorKind, StatsPlatform};
use crate::leaderboard::LeaderboardStore;
use crate::scrape::{ScrapedStats, ScrapedStatsCollection};

type FlightKey = (Game, String, StatsPlatform, Option<String>);

fn fresh_key(game: Game, username: &str, platform: StatsPlatform, season: Option<&str>) -> String {
    format!(
        "stats:{g}:{u}:{p}:{s}",
        g = game.as_str(),
        u = username.trim().to_ascii_lowercase(),
        p = platform_key(platform),
        s = season.unwrap_or("")
    )
}

fn stale_key(game: Game, username: &str, platform: StatsPlatform, season: Option<&str>) -> String {
    format!(
        "stats:stale:{g}:{u}:{p}:{s}",
        g = game.as_str(),
        u = username.trim().to_ascii_lowercase(),
        p = platform_key(platform),
        s = season.unwrap_or("")
    )
}

fn collection_key(game: Game, username: &str, platform: StatsPlatform) -> String {
    format!(
        "stats:collection:{g}:{u}:{p}",
        g = game.as_str(),
        u = username.trim().to_ascii_lowercase(),
        p = platform_key(platform)
    )
}

fn platform_key(p: StatsPlatform) -> &'static str {
    match p {
        StatsPlatform::Auto => "auto",
        StatsPlatform::Pc => "pc",
        StatsPlatform::Xbox => "xbox",
        StatsPlatform::Playstation => "psn",
    }
}

pub struct RedisStatsCacheStore {
    conn: ConnectionManager,
    registry: Arc<StatsBackendRegistry>,
    cfg: StatsCacheConfigV2,
    flight: SingleFlight<FlightKey, Arc<Result<ScrapedStats, StatsFetchError>>>,
    leaderboard: Option<Arc<LeaderboardStore>>,
}

impl RedisStatsCacheStore {
    pub fn new(
        conn: ConnectionManager,
        registry: Arc<StatsBackendRegistry>,
        cfg: StatsCacheConfigV2,
        leaderboard: Option<Arc<LeaderboardStore>>,
    ) -> Self {
        Self {
            conn,
            registry,
            cfg,
            flight: SingleFlight::new(),
            leaderboard,
        }
    }
}

#[async_trait]
impl StatsCacheStore for RedisStatsCacheStore {
    async fn fetch(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Result<CachedStats, StatsFetchError> {
        let fresh = fresh_key(game, username, platform, season);
        let stale = stale_key(game, username, platform, season);

        let mut conn = self.conn.clone();
        if let Some(raw) = conn.get::<_, Option<String>>(&fresh).await.ok().flatten()
            && let Ok(stats) = serde_json::from_str::<ScrapedStats>(&raw)
        {
            return Ok(CachedStats {
                stats,
                degraded: false,
            });
        }

        let flight_key: FlightKey = (
            game,
            username.trim().to_ascii_lowercase(),
            platform,
            season.map(|s| s.to_string()),
        );

        let registry = self.registry.clone();
        let (game_c, user_c, plat_c, seas_c) = (
            game,
            username.to_string(),
            platform,
            season.map(|s| s.to_string()),
        );
        let username_for_lb = user_c.clone();
        let stats_for_lb = self.leaderboard.clone();
        let game_for_lb = game;
        let result = self
            .flight
            .do_or_wait(flight_key, move || async move {
                Arc::new(
                    registry
                        .fetch(game_c, &user_c, plat_c, seas_c.as_deref())
                        .await,
                )
            })
            .await;

        match &*result {
            Ok(stats) => {
                let payload = serde_json::to_string(stats).unwrap_or_default();
                let ttl_ms = self.cfg.ttl_for(game).as_secs();
                let grace_ms = self.cfg.stale_grace.as_secs();
                let mut conn = self.conn.clone();
                let _: () = redis::pipe()
                    .atomic()
                    .set_ex(&fresh, &payload, ttl_ms)
                    .set_ex(&stale, &payload, grace_ms)
                    .query_async(&mut conn)
                    .await
                    .unwrap_or(());

                if let Some(lb) = &stats_for_lb {
                    lb.touch(game_for_lb, "", &username_for_lb, stats).await;
                }

                Ok(CachedStats {
                    stats: stats.clone(),
                    degraded: false,
                })
            }
            Err(err) => {
                if matches!(err.kind, StatsFetchErrorKind::GcUnavailable) {
                    let mut conn = self.conn.clone();
                    if let Some(raw) = conn.get::<_, Option<String>>(&stale).await.ok().flatten()
                        && let Ok(stats) = serde_json::from_str::<ScrapedStats>(&raw)
                    {
                        return Ok(CachedStats {
                            stats,
                            degraded: true,
                        });
                    }
                }
                Err(StatsFetchError {
                    kind: err.kind.clone(),
                    message: err.message.clone(),
                    retryable: err.retryable,
                    status: err.status,
                    requested_season: err.requested_season.clone(),
                    available_seasons: err.available_seasons.clone(),
                })
            }
        }
    }

    async fn fetch_collection(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError> {
        let key = collection_key(game, username, platform);

        let mut conn = self.conn.clone();
        if let Some(raw) = conn.get::<_, Option<String>>(&key).await.ok().flatten()
            && let Ok(collection) = serde_json::from_str::<ScrapedStatsCollection>(&raw)
        {
            return Ok(collection);
        }

        let result = self
            .registry
            .fetch_collection(game, username, platform)
            .await?;

        let payload = serde_json::to_string(&result).unwrap_or_default();
        let ttl = self.cfg.ttl_for(game).as_secs();
        let mut conn = self.conn.clone();
        let _: () = conn.set_ex(&key, &payload, ttl).await.unwrap_or(());

        Ok(result)
    }
}
