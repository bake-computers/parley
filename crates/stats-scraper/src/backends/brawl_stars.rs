//! Brawl Stars backend — fetches player stats via the official Brawl Stars API.

use std::sync::Arc;

use async_trait::async_trait;

use super::{Game, StatsBackend};
use crate::fetch::{StatsFetchError, StatsFetchErrorKind, StatsPlatform};
use crate::scrape::{
    CalculatedMetrics, RankedStats, ScrapedStats, ScrapedStatsCollection, SeasonCatalogEntry,
    StatsProfile,
};
use brawl_stars::{BrawlStarsClient, BrawlStarsError};

pub struct BrawlStarsBackend {
    client: Arc<BrawlStarsClient>,
}

impl BrawlStarsBackend {
    pub fn new(client: Arc<BrawlStarsClient>) -> Self {
        Self { client }
    }
}

fn map_bs_err(e: BrawlStarsError) -> StatsFetchError {
    let (kind, retryable) = match &e {
        BrawlStarsError::PlayerNotFound => (StatsFetchErrorKind::ProfileNotFound, false),
        BrawlStarsError::RateLimited => (StatsFetchErrorKind::GcUnavailable, true),
        BrawlStarsError::Unauthorized => (StatsFetchErrorKind::GcUnavailable, false),
        BrawlStarsError::Network(_) => (StatsFetchErrorKind::Network, true),
        BrawlStarsError::Api { .. } => (StatsFetchErrorKind::GcUnavailable, true),
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

fn trophy_tier(trophies: i32) -> (&'static str, &'static str) {
    match trophies {
        0..500 => ("Bronze", "bronze"),
        500..1000 => ("Silver", "silver"),
        1000..2000 => ("Gold", "gold"),
        2000..5000 => ("Diamond", "diamond"),
        5000..10000 => ("Mythic", "mythic"),
        10000..20000 => ("Legendary", "legendary"),
        _ => ("Masters", "masters"),
    }
}

#[async_trait]
impl StatsBackend for BrawlStarsBackend {
    fn game(&self) -> Game {
        Game::BrawlStars
    }

    async fn fetch(
        &self,
        username: &str,
        platform: StatsPlatform,
        _season: Option<&str>,
    ) -> Result<ScrapedStats, StatsFetchError> {
        let profile = self.client.get_player(username).await.map_err(map_bs_err)?;

        let match_count = match self.client.get_battlelog(username).await {
            Ok(log) => log.items.len() as i32,
            Err(e) => {
                tracing::debug!(error = %e, "battlelog fetch failed, continuing without it");
                0
            }
        };

        let (rank_name, rank_tier) = trophy_tier(profile.trophies);

        Ok(ScrapedStats {
            profile: StatsProfile {
                username: profile.name.clone(),
                level: profile.exp_level,
                profile_id: profile.tag.clone(),
                platform: platform.as_str().to_string(),
                profile_url: format!(
                    "https://brawlstats.com/profile/{}",
                    brawl_stars::encode_tag(&profile.tag)
                ),
            },
            ranked_stats: RankedStats {
                season: "current".to_string(),
                season_slug: "current".to_string(),
                season_display: "Current".to_string(),
                season_started_at: String::new(),
                mode: "trophies".to_string(),
                matches: match_count,
                wins: 0,
                losses: 0,
                abandons: 0,
                kills: 0,
                deaths: 0,
                assists: 0,
                headshots: 0,
                kd_ratio: 0.0,
                headshot_percentage: 0.0,
                win_rate: 0.0,
                rank_points: profile.trophies,
                peak_rank_points: profile.highest_trophies,
                current_rank_slug: rank_tier.to_string(),
                current_rank: rank_name.to_string(),
                current_rank_tier: rank_tier.to_string(),
                peak_rank_slug: String::new(),
                peak_rank: String::new(),
                peak_rank_tier: String::new(),
                all_time_peak_rank_slug: String::new(),
                all_time_peak_rank: String::new(),
                all_time_peak_rank_tier: String::new(),
                all_time_peak_rank_points: profile.highest_trophies,
                all_time_peak_rank_season: String::new(),
                rounds_played: 0,
                kill_rounds: 0,
                survival_rounds: 0,
                traded_rounds: 0,
                opening_kill_rounds: 0,
                matches_in_cache: match_count,
            },
            calculated_metrics: CalculatedMetrics {
                kost: 0.0,
                kost_lower_bound: 0.0,
                kost_upper_bound: 0.0,
                kost_description: serde_json::json!({
                    "brawl_stars": {
                        "tag": profile.tag,
                        "trophies": profile.trophies,
                        "highest_trophies": profile.highest_trophies,
                        "exp_level": profile.exp_level,
                        "brawlers_count": profile.brawlers_count(),
                        "club": profile.club.as_ref().map(|c| c.name.clone().unwrap_or_default()),
                    }
                })
                .to_string(),
            },
        })
    }

    async fn fetch_collection(
        &self,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError> {
        let stats = self.fetch(username, platform, None).await?;
        Ok(ScrapedStatsCollection {
            latest: stats.clone(),
            by_season: std::collections::BTreeMap::from([("current".to_string(), stats)]),
            season_catalog: vec![SeasonCatalogEntry {
                slug: "current".to_string(),
                display: "Current".to_string(),
                started_at: String::new(),
            }],
        })
    }
}
