//! Postgres-backed `StatsCacheStore`.
//!
//! Flow for `fetch(game, username, platform, season)`:
//!
//!   1. Upsert the `players` row by `(game, username_normalized, platform)`
//!      and capture the stable `player_id`.
//!   2. Look up the freshest `player_stat_snapshots` row for
//!      `(game, player_id)` within the per-game TTL. Return immediately
//!      if fresh.
//!   3. Single-flight into the backend registry. On success, insert a new
//!      snapshot row (transactionally) and return the fresh stats.
//!   4. On backend `GcUnavailable`, look for a snapshot within the
//!      configured `stale_grace` window and return it with `degraded = true`.
//!      Otherwise propagate the error.

use std::sync::Arc;

use async_trait::async_trait;
use diesel_async::AsyncPgConnection;

use crate::backends::{Game, StatsBackendRegistry};
use crate::cache_store::{CachedStats, SingleFlight, StatsCacheConfigV2, StatsCacheStore};
use crate::db::Game as DbGame;
use crate::db::models::NewPlayerStatSnapshot;
use crate::db::pool::DbPool;
use crate::db::repos::{PlayerRepo, PlayerStatSnapshotRepo, now_ms};
use crate::fetch::{StatsFetchError, StatsFetchErrorKind, StatsPlatform};
use crate::logging::AxiomLogger;
use crate::scrape::{ScrapedStats, ScrapedStatsCollection};

fn to_db_game(g: Game) -> DbGame {
    match g {
        Game::R6 => DbGame::R6,
    }
}

pub struct PostgresStatsCacheStore {
    pool: DbPool,
    registry: Arc<StatsBackendRegistry>,
    cfg: StatsCacheConfigV2,
    flight: SingleFlight<(Game, i32, Option<String>), Arc<Result<ScrapedStats, StatsFetchError>>>,
    axiom: AxiomLogger,
}

impl PostgresStatsCacheStore {
    pub fn new(
        pool: DbPool,
        registry: Arc<StatsBackendRegistry>,
        cfg: StatsCacheConfigV2,
        axiom: AxiomLogger,
    ) -> Self {
        Self {
            pool,
            registry,
            cfg,
            flight: SingleFlight::new(),
            axiom,
        }
    }

    async fn conn(
        &self,
    ) -> Result<
        bb8::PooledConnection<
            '_,
            diesel_async::pooled_connection::AsyncDieselConnectionManager<AsyncPgConnection>,
        >,
        StatsFetchError,
    > {
        self.pool.get().await.map_err(|e| StatsFetchError {
            kind: StatsFetchErrorKind::Network,
            message: format!("db pool: {e}"),
            retryable: true,
            status: None,
            requested_season: None,
            available_seasons: Vec::new(),
        })
    }

    async fn upsert_player(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<i32, StatsFetchError> {
        let start = std::time::Instant::now();
        let mut conn = self.conn().await?;
        let result = PlayerRepo::upsert_by_identity(
            &mut *conn,
            to_db_game(game),
            username,
            platform.as_str(),
            None,
            None,
        )
        .await;
        let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
        let error = result.as_ref().err().map(|e| e.to_string());
        self.axiom.log_db("upsert", "players", duration_ms, error);
        result.map(|p| p.id).map_err(map_diesel)
    }

    async fn read_snapshot_within(
        &self,
        game: Game,
        player_id: i32,
        max_age_ms: i64,
    ) -> Result<Option<ScrapedStats>, StatsFetchError> {
        let start = std::time::Instant::now();
        let mut conn = self.conn().await?;
        let row = PlayerStatSnapshotRepo::latest_fresh(
            &mut *conn,
            to_db_game(game),
            player_id,
            now_ms(),
            max_age_ms,
        )
        .await;
        let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
        let error = row.as_ref().err().map(|e| e.to_string());
        self.axiom
            .log_db("select", "player_stat_snapshots", duration_ms, error);
        row.map(|opt| opt.and_then(|r| serde_json::from_str::<ScrapedStats>(&r.payload_json).ok()))
            .map_err(map_diesel)
    }

    async fn write_snapshot(
        &self,
        game: Game,
        player_id: i32,
        stats: &ScrapedStats,
    ) -> Result<(), StatsFetchError> {
        let payload_json = serde_json::to_string(stats).map_err(|e| StatsFetchError {
            kind: StatsFetchErrorKind::InvalidPayload,
            message: format!("serialize snapshot: {e}"),
            retryable: false,
            status: None,
            requested_season: None,
            available_seasons: Vec::new(),
        })?;
        let now = now_ms();
        let new_row = NewPlayerStatSnapshot {
            player_id,
            game: to_db_game(game),
            fetched_at: now,
            source: "backend",
            cache_version: 1,
            current_rank: Some(stats.ranked_stats.current_rank.as_str()),
            rank_points: stats.ranked_stats.rank_points,
            matches: stats.ranked_stats.matches,
            wins: stats.ranked_stats.wins,
            losses: stats.ranked_stats.losses,
            kills: stats.ranked_stats.kills,
            deaths: stats.ranked_stats.deaths,
            assists: stats.ranked_stats.assists,
            headshots: stats.ranked_stats.headshots,
            kd_ratio: stats.ranked_stats.kd_ratio,
            headshot_percentage: stats.ranked_stats.headshot_percentage,
            win_rate: stats.ranked_stats.win_rate,
            kost: stats.calculated_metrics.kost,
            metadata: None,
            payload_json: &payload_json,
            created_at: now,
        };
        let start = std::time::Instant::now();
        let mut conn = self.conn().await?;
        let result = PlayerStatSnapshotRepo::insert(&mut *conn, new_row).await;
        let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
        let error = result.as_ref().err().map(|e| e.to_string());
        self.axiom
            .log_db("insert", "player_stat_snapshots", duration_ms, error);
        result.map(|_| ()).map_err(map_diesel)
    }
}

fn map_diesel(e: diesel::result::Error) -> StatsFetchError {
    StatsFetchError {
        kind: StatsFetchErrorKind::Network,
        message: format!("db: {e}"),
        retryable: true,
        status: None,
        requested_season: None,
        available_seasons: Vec::new(),
    }
}

#[async_trait]
impl StatsCacheStore for PostgresStatsCacheStore {
    async fn fetch(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Result<CachedStats, StatsFetchError> {
        // 1. player_id
        let player_id = self.upsert_player(game, username, platform).await?;

        // 2. fast path (fresh snapshot)
        let ttl_ms = self.cfg.ttl_for(game).as_millis() as i64;
        if let Some(stats) = self.read_snapshot_within(game, player_id, ttl_ms).await? {
            self.axiom.log_cache("hit", game.as_str(), None);
            return Ok(CachedStats {
                stats,
                degraded: false,
            });
        }
        self.axiom.log_cache("miss", game.as_str(), None);

        // 3. single-flight cold miss
        let registry = self.registry.clone();
        let flight_key = (game, player_id, season.map(|s| s.to_string()));
        let (user_c, plat_c, seas_c) = (
            username.to_string(),
            platform,
            season.map(|s| s.to_string()),
        );
        let backend_result = self
            .flight
            .do_or_wait(flight_key, move || async move {
                Arc::new(
                    registry
                        .fetch(game, &user_c, plat_c, seas_c.as_deref())
                        .await,
                )
            })
            .await;

        match &*backend_result {
            Ok(stats) => {
                // Best-effort snapshot write; a write failure doesn't fail the fetch.
                if let Err(e) = self.write_snapshot(game, player_id, stats).await {
                    tracing::warn!(error = %e.message, "snapshot write failed");
                }
                Ok(CachedStats {
                    stats: stats.clone(),
                    degraded: false,
                })
            }
            Err(err) => {
                // 4. stale-grace for GcUnavailable only
                if matches!(err.kind, StatsFetchErrorKind::GcUnavailable) {
                    let grace_ms = self.cfg.stale_grace.as_millis() as i64;
                    if let Some(stats) =
                        self.read_snapshot_within(game, player_id, grace_ms).await?
                    {
                        self.axiom.log_cache("stale_serve", game.as_str(), None);
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
        // Collections aren't cached on a per-season basis here; delegate
        // straight to the backend. The FetchStats single-season path covers
        // the hot case; collections are a debugging/backfill tool.
        self.registry
            .fetch_collection(game, username, platform)
            .await
    }
}
