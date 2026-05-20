//! Bridge from [`StatsClient`] / [`BrowserPool`] to the Siphon [`StatsFetcher`]
//! closure type.
//!
//! Siphon workers call a pluggable async closure to fetch connected UIDs for a
//! given seed. This module provides two fetcher implementations:
//!
//! * [`create_stats_fetcher`] — HTTP-backed via `stats-scraper`'s `StatsClient`.
//!   Fast and lightweight, but only works when stats.cc server-side renders
//!   opponent data (currently broken due to upstream format changes).
//! * [`create_browser_stats_fetcher`] — Headless browser-backed via
//!   [`BrowserPool`]. Slower but works with the current stats.cc client-side
//!   rendering model.

use std::sync::Arc;

use stats_scraper::fetch::{StatsClient, StatsFetchError, StatsFetchErrorKind, StatsPlatform};

use super::browser::BrowserPool;
use super::parser::extract_opponent_usernames_from_html;
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
/// Uses [`StatsClient::fetch_stats_collection_with_html`] to obtain both the
/// canonical profile page HTML (which includes the full Nuxt payload with
/// linked profiles) and the parsed stats collection. The returned closure
/// extracts opponent / teammate **display names** from
/// `/siege/{username}/{uuid}` URLs in the Nuxt payload — the same form
/// `StatsClient` accepts as input on a subsequent crawl.
pub fn create_stats_fetcher(client: Arc<StatsClient>, platform: StatsPlatform) -> StatsFetcher {
    Arc::new(move |uid: &str| {
        let client = Arc::clone(&client);
        let uid = uid.to_string();
        Box::pin(async move {
            let (_collection, html) = match client
                .fetch_stats_collection_with_html(&uid, platform)
                .await
            {
                Ok(v) => v,
                Err(e) => return map_fetch_error(e),
            };

            Ok(extract_opponent_usernames_from_html(&html))
        })
    })
}

/// Create a [`StatsFetcher`] closure backed by a headless browser.
///
/// Uses a shared [`BrowserPool`] to navigate to stats.cc profile pages,
/// wait for client-side JavaScript to render match data, and extract opponent
/// usernames from `/siege/{username}/{uuid}` links in the rendered DOM.
///
/// This is the preferred fetcher for current stats.cc since the upstream site
/// loads match participant data via client-side API calls rather than SSR.
pub fn create_browser_stats_fetcher(pool: BrowserPool, platform: StatsPlatform) -> StatsFetcher {
    let platform_str = platform.as_str().to_string();
    Arc::new(move |uid: &str| {
        let pool = pool.clone();
        let uid = uid.to_string();
        let platform_str = platform_str.clone();
        Box::pin(async move {
            match pool.scrape_opponent_usernames(&uid, &platform_str).await {
                Ok(usernames) => Ok(usernames),
                Err(e) => Err(format!("browser fetch failed for {uid}: {e}")),
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
