//! End-to-end integration test that boots the engine-service on a random port
//! and calls the ConnectRPC endpoint over HTTP.
//!
//! Covers:
//!   * `GET /health` returns 200 OK

use std::net::SocketAddr;
use tokio::net::TcpListener;

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
async fn health_endpoint_returns_ok() {
    let addr = spawn_test_server().await;
    let resp = reqwest::get(format!("http://{addr}/health")).await.unwrap();
    assert_eq!(resp.status(), 200);
    assert_eq!(resp.text().await.unwrap(), "OK");
}
