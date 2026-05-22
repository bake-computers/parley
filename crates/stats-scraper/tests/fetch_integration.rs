//! End-to-end integration test for the HTTP fetch layer, using `wiremock` to
//! simulate stats.cc without hitting the real network. The fixture mimics the
//! real Nuxt payload shape closely enough to exercise the full scrape pipeline.

use stats_scraper::{
    StatsClient,
    fetch::{StatsFetchErrorKind, StatsPlatform},
};
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

const UUID: &str = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";

fn nuxt_html_ranked() -> String {
    // Keep structure small but representative of a real response.
    let payload = serde_json::json!([
        {
            "username": "FixturePlayer",
            "level": 100,
            "ranked_season_records": {
                "prep-phase": {
                    "rank": "diamond-2",
                    "max_rank": "diamond-1",
                    "rank_points": 4200,
                    "max_rank_points": 4500
                }
            },
            "season_mode_records": {
                "prep-phase": {
                    "ranked-bomb": {
                        "matches": 12,
                        "wins": 8,
                        "losses": 4,
                        "kills": 120,
                        "deaths": 80,
                        "assists": 20,
                        "headshots": 40,
                        "kd": 1.5,
                        "hs": 33.33,
                        "wr": 66.66
                    }
                }
            }
        },
        {
            "rank_tiers": { "diamond": { "display": "Diamond" } },
            "ranks": {
                "diamond-2": { "display": "Diamond II", "tier": "diamond" },
                "diamond-1": { "display": "Diamond I", "tier": "diamond" }
            },
            "seasons": {
                "prep-phase": { "display": "Prep Phase", "started_at": "2026-01-01T00:00:00Z" }
            }
        }
    ]);
    format!(
        "<html><head><script id=\"__NUXT_DATA__\" type=\"application/json\">{}</script></head><body></body></html>",
        payload
    )
}

#[tokio::test]
async fn fetch_stats_end_to_end_through_mock_server() {
    let server = MockServer::start().await;

    // Search returns a redirect URL to the canonical profile path. wiremock's
    // default response URL will appear as the final request URL, matching the
    // TS behaviour after `redirect: "follow"`.
    let canonical = format!("/siege/FixturePlayer/{UUID}");
    Mock::given(method("GET"))
        .and(path("/siege"))
        .and(query_param("displayName", "FixturePlayer"))
        .and(query_param("platform", "pc"))
        .respond_with(
            ResponseTemplate::new(302)
                .insert_header("location", format!("{}{canonical}", server.uri()).as_str()),
        )
        .mount(&server)
        .await;

    // The canonical profile page returns the HTML containing __NUXT_DATA__.
    Mock::given(method("GET"))
        .and(path(canonical.clone()))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/html")
                .set_body_string(nuxt_html_ranked()),
        )
        .mount(&server)
        .await;

    let client = StatsClient::with_base_url(server.uri());
    let stats = client
        .fetch_stats("FixturePlayer", StatsPlatform::Pc, None)
        .await
        .expect("fetch_stats succeeds");

    assert_eq!(stats.profile.username, "FixturePlayer");
    assert_eq!(stats.profile.platform, "pc");
    assert_eq!(stats.profile.profile_id, UUID);
    assert_eq!(stats.ranked_stats.current_rank, "Diamond II");
    assert_eq!(stats.ranked_stats.current_rank_tier, "Diamond");
    assert_eq!(stats.ranked_stats.matches, 12);
    assert_eq!(stats.ranked_stats.wins, 8);
    assert!((stats.ranked_stats.kd_ratio - 1.5).abs() < 1e-6);
}

#[tokio::test]
async fn fetch_stats_reports_profile_not_found_when_all_platforms_miss() {
    let server = MockServer::start().await;

    // Every platform lookup returns 404.
    Mock::given(method("GET"))
        .and(path("/siege"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;

    let client = StatsClient::with_base_url(server.uri());
    let err = client
        .fetch_stats("Ghost", StatsPlatform::Auto, None)
        .await
        .unwrap_err();

    assert_eq!(err.kind, StatsFetchErrorKind::ProfileNotFound);
    assert!(!err.retryable);
}

#[tokio::test]
async fn fetch_stats_reports_retryable_status_on_rate_limit() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/siege"))
        .respond_with(ResponseTemplate::new(429))
        .mount(&server)
        .await;

    let client = StatsClient::with_base_url(server.uri())
        .with_retry(stats_scraper::fetch::RetryPolicy::none());
    let err = client
        .fetch_stats("RateLimited", StatsPlatform::Auto, None)
        .await
        .unwrap_err();

    assert_eq!(err.kind, StatsFetchErrorKind::HttpStatus);
    assert!(err.retryable);
    assert_eq!(err.status, Some(429));
}

#[tokio::test]
async fn fetch_stats_parses_nuxt_payload_even_on_500_body() {
    // stats.cc sometimes returns 500 with a valid __NUXT_DATA__ body. The
    // scraper should happily parse it instead of failing hard.
    let server = MockServer::start().await;
    let canonical = format!("/siege/FixturePlayer/{UUID}");
    Mock::given(method("GET"))
        .and(path("/siege"))
        .and(query_param("displayName", "FixturePlayer"))
        .and(query_param("platform", "pc"))
        .respond_with(
            ResponseTemplate::new(302)
                .insert_header("location", format!("{}{canonical}", server.uri()).as_str()),
        )
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path(canonical))
        .respond_with(
            ResponseTemplate::new(500)
                .insert_header("content-type", "text/html")
                .set_body_string(nuxt_html_ranked()),
        )
        .mount(&server)
        .await;

    let client = StatsClient::with_base_url(server.uri())
        .with_retry(stats_scraper::fetch::RetryPolicy::none());
    let stats = client
        .fetch_stats("FixturePlayer", StatsPlatform::Pc, None)
        .await
        .expect("scrape succeeds on 500 body with valid payload");
    assert_eq!(stats.ranked_stats.matches, 12);
    assert_eq!(stats.ranked_stats.current_rank, "Diamond II");
}

#[tokio::test]
async fn fetch_stats_retries_transient_500_then_succeeds() {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // First two canonical-page hits return 500 with NO payload; third returns 200 with payload.
    let server = MockServer::start().await;
    let canonical = format!("/siege/FixturePlayer/{UUID}");

    Mock::given(method("GET"))
        .and(path("/siege"))
        .and(query_param("displayName", "FixturePlayer"))
        .and(query_param("platform", "pc"))
        .respond_with(
            ResponseTemplate::new(302)
                .insert_header("location", format!("{}{canonical}", server.uri()).as_str()),
        )
        .mount(&server)
        .await;

    let hits = Arc::new(AtomicUsize::new(0));
    let hits_clone = hits.clone();
    let server_uri = server.uri();
    let canonical_for_mock = canonical.clone();
    Mock::given(method("GET"))
        .and(path(canonical_for_mock))
        .respond_with(move |_req: &wiremock::Request| {
            let n = hits_clone.fetch_add(1, Ordering::SeqCst);
            if n < 2 {
                ResponseTemplate::new(500).set_body_string("<html><body>broken</body></html>")
            } else {
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/html")
                    .set_body_string(nuxt_html_ranked())
            }
        })
        .mount(&server)
        .await;
    let _ = server_uri;

    let client =
        StatsClient::with_base_url(server.uri()).with_retry(stats_scraper::fetch::RetryPolicy {
            max_attempts: 3,
            initial_backoff_ms: 1,
            max_backoff_ms: 1,
        });

    let stats = client
        .fetch_stats("FixturePlayer", StatsPlatform::Pc, None)
        .await
        .expect("succeeds after two retries");
    assert_eq!(stats.ranked_stats.matches, 12);
    // Each attempt triggers 2 canonical-page GETs (one during the search
    // redirect follow, one during the explicit page fetch). The mock returns
    // 500 for the first 2 hits and 200 thereafter, so attempt 1 gets two 500s,
    // attempt 2 gets one 500 + one 200 (which is the successful parse).
    let total = hits.load(Ordering::SeqCst);
    assert!((3..=4).contains(&total), "unexpected hit count: {total}");
}
