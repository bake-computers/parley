//! stats-scraper — Rust port of the TypeScript stats.cc scraper.
//!
//! This crate is a pure library. It exposes:
//!   * `fetch_stats` / `fetch_stats_collection` async entry points
//!   * `scrape_html_stats_collection` for offline parsing
//!   * proto-generated types under [`proto`] for cross-service consumption
//!
//! No global state; all network I/O goes through a configurable `reqwest::Client`.

pub mod backends;
pub mod cache;
pub mod cache_store;
pub mod fetch;
pub mod metrics;
pub mod nuxt;
pub mod scrape;

/// Generated proto types: `parley.common.v1.*`, `parley.stats.v1.*`.
pub mod proto {
    pub mod common {
        pub mod v1 {
            include!(concat!(env!("OUT_DIR"), "/parley.common.v1.rs"));
        }
    }
    pub mod stats {
        pub mod v1 {
            include!(concat!(env!("OUT_DIR"), "/parley.stats.v1.rs"));
        }
    }
}

pub use backends::{
    brawl_stars::BrawlStarsBackend, r6::R6Backend, Game, StatsBackend, StatsBackendRegistry,
};
pub use cache::{StatsCache, StatsCacheConfig};
pub use cache_store::{
    CachedStats, InMemoryStatsCacheStore, SingleFlight, StatsCacheConfigV2, StatsCacheStore,
};
pub use fetch::{
    fetch_stats, fetch_stats_collection, StatsClient, StatsFetchError, StatsFetchErrorKind,
    StatsPlatform,
};
pub use nuxt::NuxtResolver;
pub use scrape::{
    scrape_html_stats, scrape_html_stats_collection, CalculatedMetrics, RankedStats, ScrapedStats,
    ScrapedStatsCollection, SeasonCatalogEntry, StatsProfile,
};
