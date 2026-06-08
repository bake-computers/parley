//! Async persistence of scraped stats into `player_stat_snapshots`.

use std::sync::Arc;

use async_trait::async_trait;

use crate::backends::Game as BackendGame;
use crate::cache_store::{CachedStats, StatsCacheStore};
use crate::db::Game as DbGame;
use crate::db::models::NewPlayerStatSnapshot;
use crate::db::pool::DbPool;
use crate::db::repos::{GuildMembershipRepo, PlayerRepo, PlayerStatSnapshotRepo, now_ms};
use crate::fetch::{StatsFetchError, StatsPlatform};
use crate::guild_cache::GuildCache;
use crate::scrape::{ScrapedStats, ScrapedStatsCollection};

const CACHE_VERSION: i32 = 1;

fn backend_to_db(game: BackendGame) -> DbGame {
    match game {
        BackendGame::R6 => DbGame::R6,
    }
}

pub struct StatsPersister {
    pool: DbPool,
    guild_cache: Option<Arc<GuildCache>>,
}

impl StatsPersister {
    pub fn new(pool: DbPool, guild_cache: Option<Arc<GuildCache>>) -> Self {
        Self { pool, guild_cache }
    }

    pub fn spawn_persist(&self, game: BackendGame, stats: ScrapedStats) {
        let pool = self.pool.clone();
        let guild_cache = self.guild_cache.clone();
        tokio::spawn(async move {
            if let Err(e) = persist_snapshot(pool, guild_cache, game, &stats).await {
                tracing::warn!(error = %e, "stats snapshot persist failed");
            }
        });
    }
}

pub async fn persist_snapshot(
    pool: DbPool,
    guild_cache: Option<Arc<GuildCache>>,
    game: BackendGame,
    stats: &ScrapedStats,
) -> Result<(), String> {
    let db_game = backend_to_db(game);
    let mut conn = pool
        .get()
        .await
        .map_err(|e| format!("pool checkout: {e}"))?;

    let player =
        PlayerRepo::find_by_username_normalized(&mut conn, db_game, &stats.profile.username)
            .await
            .map_err(|e| format!("find player: {e}"))?;

    let Some(player) = player else {
        return Ok(());
    };

    let ranked = &stats.ranked_stats;
    let now = now_ms();
    let metadata = serde_json::json!({
        "rounds_played": ranked.rounds_played,
        "kill_rounds": ranked.kill_rounds,
        "survival_rounds": ranked.survival_rounds,
        "traded_rounds": ranked.traded_rounds,
        "opening_kill_rounds": ranked.opening_kill_rounds,
    });
    let payload_json = serde_json::to_string(stats).unwrap_or_default();

    let row = NewPlayerStatSnapshot {
        player_id: player.id,
        game: db_game,
        fetched_at: now,
        source: "stats.cc",
        cache_version: CACHE_VERSION,
        current_rank: Some(ranked.current_rank.as_str()).filter(|s| !s.is_empty()),
        rank_points: ranked.rank_points,
        matches: ranked.matches,
        wins: ranked.wins,
        losses: ranked.losses,
        kills: ranked.kills,
        deaths: ranked.deaths,
        assists: ranked.assists,
        headshots: ranked.headshots,
        kd_ratio: ranked.kd_ratio,
        headshot_percentage: ranked.headshot_percentage,
        win_rate: ranked.win_rate,
        kost: stats.calculated_metrics.kost,
        metadata: Some(metadata),
        payload_json: &payload_json,
        created_at: now,
    };

    PlayerStatSnapshotRepo::insert(&mut conn, row)
        .await
        .map_err(|e| format!("insert snapshot: {e}"))?;

    if let Some(cache) = guild_cache {
        let guild_ids = GuildMembershipRepo::guild_ids_for_player(&mut conn, db_game, player.id)
            .await
            .unwrap_or_default();
        for guild_id in guild_ids {
            cache.invalidate_guild(db_game, &guild_id).await;
        }
    }

    Ok(())
}

/// Wraps a stats cache store and persists snapshots after successful fetches.
pub struct PersistingStatsCacheStore {
    inner: Arc<dyn StatsCacheStore>,
    persister: Option<Arc<StatsPersister>>,
}

impl PersistingStatsCacheStore {
    pub fn new(inner: Arc<dyn StatsCacheStore>, persister: Option<Arc<StatsPersister>>) -> Self {
        Self { inner, persister }
    }
}

#[async_trait]
impl StatsCacheStore for PersistingStatsCacheStore {
    async fn fetch(
        &self,
        game: BackendGame,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Result<CachedStats, StatsFetchError> {
        let result = self.inner.fetch(game, username, platform, season).await?;
        if let Some(p) = &self.persister {
            p.spawn_persist(game, result.stats.clone());
        }
        Ok(result)
    }

    async fn fetch_collection(
        &self,
        game: BackendGame,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError> {
        let result = self
            .inner
            .fetch_collection(game, username, platform)
            .await?;
        if let Some(p) = &self.persister {
            p.spawn_persist(game, result.latest.clone());
        }
        Ok(result)
    }
}
