//! End-to-end integration test that boots the engine-service on a random port
//! and calls the ConnectRPC endpoint over HTTP.
//!
//! Covers:
//!   * `GET /health` returns 200 OK

use std::net::SocketAddr;
use tokio::net::TcpListener;

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
