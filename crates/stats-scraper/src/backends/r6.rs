//! R6 backend — wraps the existing `StatsClient` (stats.cc Nuxt scraper).

use async_trait::async_trait;

use super::{Game, StatsBackend};
use crate::fetch::{StatsClient, StatsFetchError, StatsPlatform};
use crate::scrape::{ScrapedStats, ScrapedStatsCollection};

/// R6 Siege backend — scrapes stats.cc via the shared `StatsClient`.
#[derive(Clone, Default)]
pub struct R6Backend {
    client: StatsClient,
}

impl R6Backend {
    pub fn new(client: StatsClient) -> Self {
        Self { client }
    }
}

#[async_trait]
impl StatsBackend for R6Backend {
    fn game(&self) -> Game {
        Game::R6
    }

    async fn fetch(
        &self,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Result<ScrapedStats, StatsFetchError> {
        self.client.fetch_stats(username, platform, season).await
    }

    async fn fetch_collection(
        &self,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError> {
        self.client.fetch_stats_collection(username, platform).await
    }
}
