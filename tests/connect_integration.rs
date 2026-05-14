//! End-to-end integration test that boots the engine-service on a random port
//! and calls the ConnectRPC endpoint over HTTP.
//!
//! Covers:
//!   * `GET /health` returns 200 OK
//!   * `POST /parley.engine.v1.EngineService/RenderProfileCard` returns a
//!     non-empty PNG encoded via either JSON or binary proto content-types.

use engine::proto::engine::v1::{ImageFormat, ImageResponse, ProfileCardRequest, RenderOptions};
use prost::Message;
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
#[path = "../src/metrics_setup.rs"]
mod metrics_setup;
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

#[tokio::test]
async fn render_profile_card_via_connect_json() {
    let addr = spawn_test_server().await;

    let req = ProfileCardRequest {
        user_id: "u1".into(),
        username: "JsonUser".into(),
        avatar_url: String::new(),
        rank: None,
        stats: None,
        badges: vec![],
        region: 0,
        locale: "en".into(),
        is_top_100: false,
        options: Some(RenderOptions {
            format: ImageFormat::Png as i32,
            ..Default::default()
        }),
    };

    let resp = reqwest::Client::new()
        .post(format!(
            "http://{addr}/parley.engine.v1.EngineService/RenderProfileCard"
        ))
        .json(&req)
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: ImageResponse = resp.json().await.unwrap();
    assert!(body.success);
    assert_eq!(body.format, "png");
    assert!(!body.image_data.is_empty(), "expected PNG bytes");
    assert_eq!(&body.image_data[0..4], b"\x89PNG");
}

#[tokio::test]
async fn render_profile_card_via_connect_proto() {
    let addr = spawn_test_server().await;

    let req = ProfileCardRequest {
        user_id: "u1".into(),
        username: "ProtoUser".into(),
        avatar_url: String::new(),
        rank: None,
        stats: None,
        badges: vec![],
        region: 0,
        locale: "en".into(),
        is_top_100: false,
        options: None,
    };
    let mut body = Vec::with_capacity(req.encoded_len());
    req.encode(&mut body).unwrap();

    let resp = reqwest::Client::new()
        .post(format!(
            "http://{addr}/parley.engine.v1.EngineService/RenderProfileCard"
        ))
        .header("content-type", "application/proto")
        .body(body)
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let bytes = resp.bytes().await.unwrap();
    let decoded = ImageResponse::decode(&*bytes).unwrap();
    assert!(decoded.success);
    assert!(!decoded.image_data.is_empty());
    assert_eq!(&decoded.image_data[0..4], b"\x89PNG");
}
