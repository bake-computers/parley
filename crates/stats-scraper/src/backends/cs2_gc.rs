//! CS2 backend — drives the CS2 Game Coordinator via `cs2-gc`.
//!
//! Surface: takes a username (or vanity URL / SteamID64) and a platform,
//! resolves the SteamID, fetches `CMsgGCCStrike15_v2_PlayersProfile` +
//! `MatchList`, and maps the result into the shared `ScrapedStats` schema.
//! CS2-specific fields (premier rating, competitive rank name, wingman
//! rank, commendations) go into the `metadata` JSONB column of the stats
//! snapshot via `ScrapedStats.calculated_metrics.kost_description` as a
//! JSON blob (expedient to keep the existing proto unchanged for now).

use std::sync::Arc;

use async_trait::async_trait;

use super::{Game, StatsBackend};
use crate::fetch::{StatsFetchError, StatsFetchErrorKind, StatsPlatform};
use crate::scrape::{
    CalculatedMetrics, RankedStats, ScrapedStats, ScrapedStatsCollection, SeasonCatalogEntry,
    StatsProfile,
};
use cs2_gc::{Cs2GcClient, Cs2GcError, Cs2Profile, SteamIdResolver};

pub struct Cs2GcBackend {
    gc: Arc<Cs2GcClient>,
    resolver: Arc<SteamIdResolver>,
}

impl Cs2GcBackend {
    pub fn new(gc: Arc<Cs2GcClient>, resolver: Arc<SteamIdResolver>) -> Self {
        Self { gc, resolver }
    }
}

fn map_cs2_err(e: Cs2GcError) -> StatsFetchError {
    let (kind, retryable) = match e {
        Cs2GcError::ProfileNotFound => (StatsFetchErrorKind::ProfileNotFound, false),
        Cs2GcError::RateLimited => (StatsFetchErrorKind::GcUnavailable, true),
        Cs2GcError::Timeout(_) | Cs2GcError::Unavailable(_) => {
            (StatsFetchErrorKind::GcUnavailable, true)
        }
        Cs2GcError::Handshake(_) | Cs2GcError::Session(_) | Cs2GcError::Protocol(_) => {
            (StatsFetchErrorKind::GcUnavailable, true)
        }
        Cs2GcError::WebApi(_) => (StatsFetchErrorKind::Network, true),
        Cs2GcError::Config(_) => (StatsFetchErrorKind::GcUnavailable, false),
    };
    StatsFetchError {
        kind,
        message: format!("{e}"),
        retryable,
        status: None,
        requested_season: None,
        available_seasons: Vec::new(),
    }
}

#[async_trait]
impl StatsBackend for Cs2GcBackend {
    fn game(&self) -> Game {
        Game::Cs2
    }

    async fn fetch(
        &self,
        username: &str,
        platform: StatsPlatform,
        _season: Option<&str>,
    ) -> Result<ScrapedStats, StatsFetchError> {
        // 1. Resolve username / vanity / full URL → SteamID64.
        let steam_id_64 = self.resolver.resolve(username).await.map_err(map_cs2_err)?;

        // 2. Fetch profile + recent games in parallel (bounded by the GC gate).
        let profile_fut = self.gc.fetch_profile(steam_id_64);
        let recent_fut = self.gc.fetch_recent_games(steam_id_64);
        let (profile, recent) = tokio::try_join!(profile_fut, recent_fut).map_err(map_cs2_err)?;

        Ok(build_scraped_stats(username, platform, &profile, recent.len() as i32))
    }

    async fn fetch_collection(
        &self,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError> {
        // CS2 doesn't have seasons in the R6 sense. Return a single-entry
        // collection so the RPC shape works.
        let stats = self.fetch(username, platform, None).await?;
        Ok(ScrapedStatsCollection {
            latest: stats.clone(),
            by_season: std::collections::BTreeMap::from([(
                "current".to_string(),
                stats.clone(),
            )]),
            season_catalog: vec![SeasonCatalogEntry {
                slug: "current".to_string(),
                display: "Current".to_string(),
                started_at: String::new(),
            }],
        })
    }
}

fn build_scraped_stats(
    username: &str,
    platform: StatsPlatform,
    p: &Cs2Profile,
    recent_match_count: i32,
) -> ScrapedStats {
    // Fold CS2-specific detail (premier rating, ranks per mode, commendations)
    // into a JSON blob parked inside `kost_description` for now. A proper
    // metadata field is plumbed through `player_stat_snapshots.metadata`
    // when the DB-backed cache stores this snapshot.
    let metadata = serde_json::json!({
        "cs2": {
            "account_id": p.account_id,
            "steam_id_64": p.steam_id_64,
            "player_level": p.player_level,
            "player_cur_xp": p.player_cur_xp,
            "player_xp_bonus_flags": p.player_xp_bonus_flags,
            "commendations": &p.commendations,
            "competitive": &p.competitive,
            "premier": &p.premier,
            "wingman": &p.wingman,
            "danger_zone": &p.danger_zone,
            "recent_match_count": recent_match_count,
        }
    });

    let (current_rank, current_rank_tier, rank_points) = rank_display(p);

    ScrapedStats {
        profile: StatsProfile {
            username: username.to_string(),
            level: p.player_level,
            profile_id: p.steam_id_64.to_string(),
            platform: platform.as_str().to_string(),
            profile_url: format!("https://steamcommunity.com/profiles/{}", p.steam_id_64),
        },
        ranked_stats: RankedStats {
            season: "current".to_string(),
            season_slug: "current".to_string(),
            season_display: "Current".to_string(),
            season_started_at: String::new(),
            mode: "competitive".to_string(),
            matches: 0,
            wins: p.competitive.as_ref().map(|r| r.wins as i32).unwrap_or(0),
            losses: 0,
            abandons: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            headshots: 0,
            kd_ratio: 0.0,
            headshot_percentage: 0.0,
            win_rate: 0.0,
            rank_points,
            peak_rank_points: 0,
            current_rank_slug: current_rank.to_ascii_lowercase().replace(' ', "-"),
            current_rank: current_rank.to_string(),
            current_rank_tier: current_rank_tier.to_string(),
            peak_rank_slug: String::new(),
            peak_rank: String::new(),
            peak_rank_tier: String::new(),
            all_time_peak_rank_slug: String::new(),
            all_time_peak_rank: String::new(),
            all_time_peak_rank_tier: String::new(),
            all_time_peak_rank_points: 0,
            all_time_peak_rank_season: String::new(),
            rounds_played: 0,
            kill_rounds: 0,
            survival_rounds: 0,
            traded_rounds: 0,
            opening_kill_rounds: 0,
            matches_in_cache: recent_match_count,
        },
        calculated_metrics: CalculatedMetrics {
            kost: 0.0,
            kost_lower_bound: 0.0,
            kost_upper_bound: 0.0,
            // Temporarily stash CS2-specific detail here until the proto
            // gains a proper JSONB-backed metadata field.
            kost_description: metadata.to_string(),
        },
    }
}

/// Render a human-readable rank + tier. Competitive rank_id 0 = unranked.
fn rank_display(p: &Cs2Profile) -> (&'static str, &'static str, i32) {
    if let Some(pr) = &p.premier {
        // Premier uses a numeric "CS Rating" (range roughly 0–30000).
        return ("Premier", "premier", pr.rank_id as i32);
    }
    if let Some(c) = &p.competitive {
        let (name, tier) = competitive_name(c.rank_id);
        return (name, tier, c.rank_id as i32);
    }
    ("Unranked", "unranked", 0)
}

fn competitive_name(id: u32) -> (&'static str, &'static str) {
    match id {
        0 => ("Unranked", "unranked"),
        1 => ("Silver I", "silver"),
        2 => ("Silver II", "silver"),
        3 => ("Silver III", "silver"),
        4 => ("Silver IV", "silver"),
        5 => ("Silver Elite", "silver"),
        6 => ("Silver Elite Master", "silver"),
        7 => ("Gold Nova I", "gold"),
        8 => ("Gold Nova II", "gold"),
        9 => ("Gold Nova III", "gold"),
        10 => ("Gold Nova Master", "gold"),
        11 => ("Master Guardian I", "master-guardian"),
        12 => ("Master Guardian II", "master-guardian"),
        13 => ("Master Guardian Elite", "master-guardian"),
        14 => ("Distinguished Master Guardian", "master-guardian"),
        15 => ("Legendary Eagle", "eagle"),
        16 => ("Legendary Eagle Master", "eagle"),
        17 => ("Supreme Master First Class", "supreme"),
        18 => ("Global Elite", "global-elite"),
        _ => ("Unknown", "unknown"),
    }
}
