//! Bridge from [`StatsClient`] to the Siphon [`StatsFetcher`] closure type.
//!
//! Siphon workers call a pluggable async closure to fetch connected UIDs for a
//! given seed. This module wraps the real HTTP-backed [`StatsClient`] from the
//! `stats-scraper` crate so it can be passed directly into the worker pool
//! without the worker knowing about HTTP, retries, or error recovery.

use std::sync::Arc;

use stats_scraper::fetch::{StatsClient, StatsFetchError, StatsFetchErrorKind, StatsPlatform};

use super::parser::extract_match_participants;
use crate::siphon::worker::StatsFetcher;

/// Map a [`StatsFetchError`] into the [`StatsFetcher`] return convention.
///
/// ProfileNotFound → skipped (empty vec, not an error).
/// HttpStatus with status 429 → rate-limited (hard error).
/// All other errors → surfaced as `Err(e.to_string())`.
fn map_fetch_error(e: StatsFetchError) -> Result<Vec<String>, String> {
    match e.kind {
        StatsFetchErrorKind::ProfileNotFound => Ok(Vec::new()),
        StatsFetchErrorKind::HttpStatus if e.status == Some(429) => Err("rate limited".to_string()),
        _ => Err(e.to_string()),
    }
}

/// Create a [`StatsFetcher`] closure backed by a real [`StatsClient`].
///
/// The returned closure:
/// 1. Calls `client.fetch_stats_collection(uid, platform)`.
/// 2. Maps errors via [`map_fetch_error`].
/// 3. On success, extracts participant UIDs via [`extract_match_participants`].
pub fn create_stats_fetcher(client: Arc<StatsClient>, platform: StatsPlatform) -> StatsFetcher {
    Arc::new(move |uid: &str| {
        let client = Arc::clone(&client);
        let uid = uid.to_string();
        Box::pin(async move {
            match client.fetch_stats_collection(&uid, platform).await {
                Ok(collection) => Ok(extract_match_participants(&collection)),
                Err(e) => map_fetch_error(e),
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_error(kind: StatsFetchErrorKind, status: Option<u16>) -> StatsFetchError {
        StatsFetchError {
            kind,
            message: "test error".into(),
            retryable: true,
            status,
            requested_season: None,
            available_seasons: Vec::new(),
        }
    }

    #[test]
    fn test_map_profile_not_found_returns_empty() {
        let err = make_error(StatsFetchErrorKind::ProfileNotFound, None);
        assert_eq!(map_fetch_error(err), Ok(Vec::new()));
    }

    #[test]
    fn test_map_rate_limited_returns_err() {
        let err = make_error(StatsFetchErrorKind::HttpStatus, Some(429));
        assert_eq!(map_fetch_error(err), Err("rate limited".to_string()));
    }

    #[test]
    fn test_map_network_error_returns_err() {
        let err = make_error(StatsFetchErrorKind::Network, None);
        let result = map_fetch_error(err);
        assert!(result.is_err());
    }

    #[test]
    fn test_map_http_status_non_429_returns_err() {
        let err = make_error(StatsFetchErrorKind::HttpStatus, Some(503));
        let result = map_fetch_error(err);
        assert!(result.is_err());
        assert_ne!(result.unwrap_err(), "rate limited");
    }

    #[test]
    fn test_map_gc_unavailable_returns_err() {
        let err = make_error(StatsFetchErrorKind::GcUnavailable, None);
        assert!(map_fetch_error(err).is_err());
    }

    #[test]
    fn test_create_stats_fetcher_compiles() {
        let client = StatsClient::with_base_url("https://stats.cc");
        let client = Arc::new(client);
        let _fetcher = create_stats_fetcher(client, StatsPlatform::Pc);
    }
}
