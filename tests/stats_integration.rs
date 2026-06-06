//! End-to-end smoke test: bring up the stats service, point `/stats/:username`
//! at a wiremock server serving a fixture stats.cc HTML page, and assert the
//! JSON response contains the expected fields.

use std::net::SocketAddr;
use tokio::net::TcpListener;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

// Declare all modules that connect depends on transitively
#[path = "../src/backends/mod.rs"]
mod backends;
#[path = "../src/backends/r6.rs"]
mod backends_r6;
#[path = "../src/cache_redis.rs"]
mod cache_redis;
#[path = "../src/cache_store.rs"]
mod cache_store;
#[path = "../src/connect.rs"]
mod connect;
#[path = "../src/context.rs"]
mod context;
#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/db/models.rs"]
mod db_models;
#[path = "../src/db/pool.rs"]
mod db_pool;
#[path = "../src/db/repos.rs"]
mod db_repos;
#[path = "../src/db/schema.rs"]
mod db_schema;
#[path = "../src/fetch.rs"]
mod fetch;
#[path = "../src/handlers/mod.rs"]
mod handlers;
#[path = "../src/leaderboard.rs"]
mod leaderboard;
#[path = "../src/logging.rs"]
mod logging;
#[path = "../src/nuxt.rs"]
mod nuxt;
#[path = "../src/proto.rs"]
mod proto;
#[path = "../src/scrape.rs"]
mod scrape;
#[path = "../src/stats_metrics.rs"]
mod stats_metrics;
#[path = "../src/stats_proto.rs"]
mod stats_proto;

const UUID: &str = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";

fn nuxt_html() -> String {
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
                        "matches": 12, "wins": 8, "losses": 4,
                        "kills": 120, "deaths": 80, "headshots": 40,
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
            "seasons": {
                "prep-phase": { "display": "Prep Phase", "started_at": "2026-01-01T00:00:00Z" }
            }
        }
    ]);
    format!(
        "<html><head><script id=\"__NUXT_DATA__\" type=\"application/json\">{payload}</script></head><body></body></html>"
    )
}

async fn spawn_test_server() -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = connect::build_router();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    addr
}

#[tokio::test]
async fn stats_endpoint_scrapes_fixture_and_returns_json() {
    let stats_server = MockServer::start().await;

    let canonical = format!("/siege/FixturePlayer/{UUID}");
    Mock::given(method("GET"))
        .and(path("/siege"))
        .and(query_param("displayName", "FixturePlayer"))
        .and(query_param("platform", "pc"))
        .respond_with(ResponseTemplate::new(302).insert_header(
            "location",
            format!("{}{canonical}", stats_server.uri()).as_str(),
        ))
        .mount(&stats_server)
        .await;

    Mock::given(method("GET"))
        .and(path(canonical))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/html")
                .set_body_string(nuxt_html()),
        )
        .mount(&stats_server)
        .await;

    let service_addr = spawn_test_server().await;

    let url = format!(
        "http://{service_addr}/stats/FixturePlayer?platform=pc&base_url={}",
        urlencoding_encode(&stats_server.uri())
    );
    let resp = reqwest::get(url).await.unwrap();
    assert_eq!(resp.status(), 200);

    let body: serde_json::Value = resp.json().await.unwrap();
    // Spot-check fields we expect the scraper to populate.
    assert_eq!(body["profile"]["username"], "FixturePlayer");
    assert_eq!(body["profile"]["platform"], "pc");
    assert_eq!(body["ranked_stats"]["current_rank"], "Diamond II");
    assert_eq!(body["ranked_stats"]["matches"], 12);
    let kd = body["ranked_stats"]["kd_ratio"].as_f64().unwrap();
    assert!((kd - 1.5).abs() < 1e-6);
}

#[tokio::test]
async fn stats_endpoint_returns_404_when_profile_missing() {
    let stats_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/siege"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&stats_server)
        .await;

    let service_addr = spawn_test_server().await;
    let url = format!(
        "http://{service_addr}/stats/Ghost?base_url={}",
        urlencoding_encode(&stats_server.uri())
    );
    let resp = reqwest::get(url).await.unwrap();
    assert_eq!(resp.status(), 404);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["code"], "ProfileNotFound");
}

#[tokio::test]
async fn fetch_stats_rpc_endpoint_rejects_invalid_json() {
    // Contract test: the StatsService ConnectRPC route is wired and returns
    // a valid JSON error envelope for malformed bodies. This avoids touching
    // real upstream stats.cc (which the shared StatsHandler would otherwise
    // hit for successful paths).
    let service_addr = spawn_test_server().await;
    let url = format!("http://{service_addr}/parley.stats.v1.StatsService/FetchStats");

    let resp = reqwest::Client::new()
        .post(url)
        .header("content-type", "application/json")
        .body("{not valid json")
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 400);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["code"], "invalid_argument");
}

/// Minimal query-string value encoder (space + `:` + `/` get percent-encoded).
fn urlencoding_encode(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    for b in v.bytes() {
        let is_unreserved = b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~');
        if is_unreserved {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}
