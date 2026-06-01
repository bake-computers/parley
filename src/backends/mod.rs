//! Game-agnostic stats fetching.
//!
//! Each game (R6, Brawl Stars, …) implements `StatsBackend` against whatever
//! upstream source is appropriate — HTML scraping for R6, the official Brawl
//! Stars REST API, etc. A `StatsBackendRegistry` routes incoming `FetchStats`
//! RPCs to the right backend based on the `Game` enum on the request.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;

use crate::fetch::{StatsFetchError, StatsFetchErrorKind, StatsPlatform};
use crate::scrape::{ScrapedStats, ScrapedStatsCollection};

pub mod r6;

/// The set of games the backend registry can dispatch to. Kept distinct from
/// the proto enum so backends don't depend on the generated proto code.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Game {
    R6,
    BrawlStars,
}

impl Game {
    pub fn as_str(self) -> &'static str {
        match self {
            Game::R6 => "r6",
            Game::BrawlStars => "brawl_stars",
        }
    }
}

/// One upstream provider of stats for a specific game.
#[async_trait]
pub trait StatsBackend: Send + Sync {
    fn game(&self) -> Game;

    async fn fetch(
        &self,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Result<ScrapedStats, StatsFetchError>;

    async fn fetch_collection(
        &self,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError>;
}

/// Simple `HashMap<Game, Arc<dyn StatsBackend>>` dispatcher.
#[derive(Default, Clone)]
pub struct StatsBackendRegistry {
    by_game: HashMap<Game, Arc<dyn StatsBackend>>,
}

impl StatsBackendRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register (or replace) the backend for a given game.
    pub fn register(&mut self, backend: Arc<dyn StatsBackend>) {
        self.by_game.insert(backend.game(), backend);
    }

    pub fn get(&self, game: Game) -> Option<Arc<dyn StatsBackend>> {
        self.by_game.get(&game).cloned()
    }

    pub fn has(&self, game: Game) -> bool {
        self.by_game.contains_key(&game)
    }

    /// Convenience: fetch, returning a clean `GcUnavailable` error when the
    /// requested game has no registered backend.
    pub async fn fetch(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Result<ScrapedStats, StatsFetchError> {
        match self.by_game.get(&game) {
            Some(b) => b.fetch(username, platform, season).await,
            None => Err(StatsFetchError {
                kind: StatsFetchErrorKind::GcUnavailable,
                message: format!("no backend registered for game={}", game.as_str()),
                retryable: true,
                status: None,
                requested_season: season.map(|s| s.to_string()),
                available_seasons: Vec::new(),
            }),
        }
    }

    pub async fn fetch_collection(
        &self,
        game: Game,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError> {
        match self.by_game.get(&game) {
            Some(b) => b.fetch_collection(username, platform).await,
            None => Err(StatsFetchError {
                kind: StatsFetchErrorKind::GcUnavailable,
                message: format!("no backend registered for game={}", game.as_str()),
                retryable: true,
                status: None,
                requested_season: None,
                available_seasons: Vec::new(),
            }),
        }
    }
}
