//! End-to-end test for the full `Engine::render_profile_card` path.
//!
//! Avatar is served by a local mock server (via wiremock) so the test has no
//! network dependency. The mock is spun up through `tokio::net::TcpListener`
//! with a minimal hand-rolled HTTP server (no extra dev dep beyond tokio).

use engine::proto::common::v1::{PlayerStats, Rank, RankTier};
use engine::proto::engine::v1::{ImageFormat, ProfileCardRequest, RenderOptions};
use engine::Engine;
use image::{Rgb, RgbImage};
use std::io::Cursor;
use std::net::SocketAddr;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

fn build_test_avatar_png() -> Vec<u8> {
    let mut img = RgbImage::new(80, 80);
    for y in 0..80 {
        for x in 0..80 {
            img.put_pixel(x, y, Rgb([80, 140, 220]));
        }
    }
    let dyn_img = image::DynamicImage::ImageRgb8(img);
    let mut buf = Vec::new();
    dyn_img
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .unwrap();
    buf
}

/// Tiny one-shot HTTP server that serves a single PNG on `/avatar.png` and
/// returns the bound socket address.
async fn spawn_png_server(body: Vec<u8>) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                return;
            };
            let body = body.clone();
            tokio::spawn(async move {
                let mut buf = [0u8; 1024];
                let _ = sock.read(&mut buf).await;
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = sock.write_all(header.as_bytes()).await;
                let _ = sock.write_all(&body).await;
                let _ = sock.shutdown().await;
            });
        }
    });
    addr
}

#[tokio::test]
async fn render_profile_card_with_fetched_avatar_produces_png() {
    let addr = spawn_png_server(build_test_avatar_png()).await;
    let avatar_url = format!("http://{addr}/avatar.png");

    let req = ProfileCardRequest {
        user_id: "12345".into(),
        username: "TestUser".into(),
        avatar_url,
        rank: Some(Rank {
            tier: RankTier::Diamond as i32,
            rating: 4200,
            position: 42,
        }),
        stats: Some(PlayerStats {
            matches_played: 50,
            wins: 30,
            losses: 20,
            kills: 250,
            deaths: 180,
            kd_ratio: 1.39,
            win_rate: 60.0,
            ..Default::default()
        }),
        badges: vec![],
        region: 0,
        locale: "en".into(),
        is_top_100: true,
        options: Some(RenderOptions {
            format: ImageFormat::Png as i32,
            width: 0,
            height: 0,
            force_regen: false,
        }),
    };

    let engine = Engine::default();
    let img = engine.render_profile_card(&req).await.expect("render ok");

    assert_eq!(img.format, engine::RenderedImageFormat::Png);
    assert!(img.bytes.len() > 1000, "expected non-trivial PNG");
    assert_eq!(&img.bytes[0..4], b"\x89PNG");
    assert_eq!(img.width, engine::card::PROFILE_CARD_WIDTH);
    assert_eq!(img.height, engine::card::PROFILE_CARD_HEIGHT);
}

#[tokio::test]
async fn render_profile_card_without_avatar_still_produces_png() {
    let req = ProfileCardRequest {
        user_id: "12345".into(),
        username: "NoAvatar".into(),
        avatar_url: String::new(),
        rank: None,
        stats: None,
        badges: vec![],
        region: 0,
        locale: "en".into(),
        is_top_100: false,
        options: None,
    };
    let engine = Engine::default();
    let img = engine.render_profile_card(&req).await.expect("render ok");
    assert_eq!(&img.bytes[0..4], b"\x89PNG");
}
