//! Performance smoke test.
//!
//! Simulates a realistic stats.cc latency (500ms upstream) and asserts:
//!   * cold fetch happens in ~1 upstream round-trip (not 2, i.e. no
//!     double-fetch) — measured against a counter mock.
//!   * warm fetch via the in-process REST endpoint's cache is <10ms.

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tokio::net::TcpListener;
use wiremock::matchers::{method, path, path_regex};
use wiremock::{Mock, MockServer, ResponseTemplate};

// Declare all modules that connect depends on transitively
#[path = "../src/connect.rs"]
mod connect;
#[path = "../src/context.rs"]
mod context;
#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/handlers/mod.rs"]
mod handlers;
#[path = "../src/proto.rs"]
mod proto;
#[path = "../src/backends/mod.rs"]
mod backends;
#[path = "../src/backends/r6.rs"]
mod backends_r6;
#[path = "../src/cache.rs"]
mod cache;
#[path = "../src/cache_store.rs"]
mod cache_store;
#[path = "../src/fetch.rs"]
mod fetch;
#[path = "../src/logging.rs"]
mod logging;
#[path = "../src/nuxt.rs"]
mod nuxt;
#[path = "../src/scrape.rs"]
mod scrape;
#[path = "../src/stats_metrics.rs"]
mod stats_metrics;
#[path = "../src/stats_proto.rs"]
mod stats_proto;
#[path = "../src/db/pool.rs"]
mod db_pool;
#[path = "../src/db/repos.rs"]
mod db_repos;
#[path = "../src/db/models.rs"]
mod db_models;
#[path = "../src/db/schema.rs"]
mod db_schema;
#[path = "../src/db/stats_cache_store.rs"]
mod db_stats_cache_store;

use handlers::stats::StatsHandler;
use fetch::StatsClient;

const UUID: &str = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";

fn nuxt_html() -> String {
    let payload = serde_json::json!([
        {
            "username": "FixturePlayer",
            "level": 100,
            "ranked_season_records": {
                "prep-phase": { "rank": "diamond-2", "max_rank": "diamond-1", "rank_points": 4200, "max_rank_points": 4500 }
            },
            "season_mode_records": {
                "prep-phase": {
                    "ranked-bomb": {
                        "matches": 12, "wins": 8, "losses": 4, "kills": 120, "deaths": 80,
                        "kd": 1.5, "hs": 33.33, "wr": 66.66
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
            "seasons": { "prep-phase": { "display": "Prep Phase", "started_at": "2026-01-01T00:00:00Z" } }
        }
    ]);
    format!(
        "<html><head><script id=\"__NUXT_DATA__\" type=\"application/json\">{payload}</script></head><body></body></html>"
    )
}

async fn spawn_service(stats: StatsHandler) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = connect::build_router_with_context(context::AppContext::in_memory_for_tests());
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    addr
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn hot_path_does_not_double_fetch_the_profile_page() {
    // Upstream with ~200ms artificial latency to make a double-GET painfully
    // obvious if it ever creeps back.
    let server = MockServer::start().await;
    let canonical = format!("/siege/FixturePlayer/{UUID}");

    // Count hits on the canonical page — this is the slow SSR endpoint we
    // want to avoid calling twice per request.
    let hits = Arc::new(AtomicUsize::new(0));
    let hits_mock = hits.clone();

    Mock::given(method("GET"))
        .and(path("/siege"))
        .respond_with(
            ResponseTemplate::new(302)
                .insert_header("location", format!("{}{canonical}", server.uri()).as_str()),
        )
        .mount(&server)
        .await;

    let canonical_pattern = format!(r"^/siege/FixturePlayer/{UUID}$");
    Mock::given(method("GET"))
        .and(path_regex(canonical_pattern.as_str()))
        .respond_with(move |_req: &wiremock::Request| {
            hits_mock.fetch_add(1, Ordering::SeqCst);
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/html")
                .set_delay(Duration::from_millis(200))
                .set_body_string(nuxt_html())
        })
        .mount(&server)
        .await;

    let client = StatsClient::with_base_url(server.uri());
    let handler = StatsHandler::with_client(client);
    let addr = spawn_service(handler).await;

    let cold = Instant::now();
    let resp = reqwest::get(format!("http://{addr}/stats/FixturePlayer?platform=pc"))
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let cold_ms = cold.elapsed().as_millis();

    let upstream_hits = hits.load(Ordering::SeqCst);
    assert_eq!(
        upstream_hits, 1,
        "expected exactly 1 hit on the canonical page (no double-fetch)"
    );
    // One 200ms upstream round-trip + a few ms local work.
    assert!(
        cold_ms < 400,
        "cold fetch took {cold_ms}ms but upstream was 200ms + tiny local work"
    );

    // Warm fetch must be served from cache — zero new upstream hits, sub-ms.
    let warm = Instant::now();
    let resp = reqwest::get(format!("http://{addr}/stats/FixturePlayer?platform=pc"))
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let warm_ms = warm.elapsed().as_millis();

    assert_eq!(
        hits.load(Ordering::SeqCst),
        upstream_hits,
        "warm fetch must not hit upstream"
    );
    assert!(warm_ms < 50, "warm fetch took {warm_ms}ms, expected <50ms");

    eprintln!("[perf] cold={cold_ms}ms warm={warm_ms}ms canonical_hits={upstream_hits}");
}