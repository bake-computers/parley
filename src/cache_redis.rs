use std::collections::HashMap;
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

const H_PROFILE: &str = "p";
const H_RANKED: &str = "r";
const H_METRICS: &str = "m";
const H_LATEST: &str = "latest";
const H_BY_SEASON: &str = "by_season";
const H_CATALOG: &str = "catalog";

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

fn stats_from_hash(fields: &HashMap<String, String>) -> Option<ScrapedStats> {
    let profile = serde_json::from_str(fields.get(H_PROFILE)?).ok()?;
    let ranked_stats = serde_json::from_str(fields.get(H_RANKED)?).ok()?;
    let calculated_metrics = serde_json::from_str(fields.get(H_METRICS)?).ok()?;
    Some(ScrapedStats {
        profile,
        ranked_stats,
        calculated_metrics,
    })
}

fn collection_from_hash(fields: &HashMap<String, String>) -> Option<ScrapedStatsCollection> {
    let latest = serde_json::from_str(fields.get(H_LATEST)?).ok()?;
    let by_season = serde_json::from_str(fields.get(H_BY_SEASON)?).ok()?;
    let season_catalog = serde_json::from_str(fields.get(H_CATALOG)?).ok()?;
    Some(ScrapedStatsCollection {
        latest,
        by_season,
        season_catalog,
    })
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
        let fields: HashMap<String, String> = conn.hgetall(&fresh).await.unwrap_or_default();
        if let Some(stats) = stats_from_hash(&fields) {
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
                let profile_json = serde_json::to_string(&stats.profile).unwrap_or_default();
                let ranked_json = serde_json::to_string(&stats.ranked_stats).unwrap_or_default();
                let metrics_json =
                    serde_json::to_string(&stats.calculated_metrics).unwrap_or_default();
                let ttl_secs = self.cfg.ttl_for(game).as_secs() as i64;
                let grace_secs = self.cfg.stale_grace.as_secs() as i64;
                let mut conn = self.conn.clone();
                let _: () = redis::pipe()
                    .atomic()
                    .hset(&fresh, H_PROFILE, &profile_json)
                    .hset(&fresh, H_RANKED, &ranked_json)
                    .hset(&fresh, H_METRICS, &metrics_json)
                    .expire(&fresh, ttl_secs)
                    .hset(&stale, H_PROFILE, &profile_json)
                    .hset(&stale, H_RANKED, &ranked_json)
                    .hset(&stale, H_METRICS, &metrics_json)
                    .expire(&stale, grace_secs)
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
                    let fields: HashMap<String, String> =
                        conn.hgetall(&stale).await.unwrap_or_default();
                    if let Some(stats) = stats_from_hash(&fields) {
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
        let fields: HashMap<String, String> = conn.hgetall(&key).await.unwrap_or_default();
        if let Some(collection) = collection_from_hash(&fields) {
            return Ok(collection);
        }

        let result = self
            .registry
            .fetch_collection(game, username, platform)
            .await?;

        let latest_json = serde_json::to_string(&result.latest).unwrap_or_default();
        let by_season_json = serde_json::to_string(&result.by_season).unwrap_or_default();
        let catalog_json = serde_json::to_string(&result.season_catalog).unwrap_or_default();
        let ttl_secs = self.cfg.ttl_for(game).as_secs() as i64;
        let mut conn = self.conn.clone();
        let _: () = redis::pipe()
            .atomic()
            .hset(&key, H_LATEST, &latest_json)
            .hset(&key, H_BY_SEASON, &by_season_json)
            .hset(&key, H_CATALOG, &catalog_json)
            .expire(&key, ttl_secs)
            .query_async(&mut conn)
            .await
            .unwrap_or(());

        Ok(result)
    }
}
