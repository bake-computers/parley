//! Axum + ConnectRPC wiring.
//!
//! Two states coexist:
//!   * `AppContext` — the full, DB-aware state used by the binary and by
//!     tests that want to reach the pool. This is the modern path.
//!   * `AppState` — the small pre-Diesel handler bundle used by the existing
//!     integration tests (`tests/*`). Kept so those tests continue to pass
//!     unchanged; `build_router_with_state` is a thin adapter that fabricates
//!     an `AppContext` with `pool = None`.
//!
//! Connect envelope (unary):
//!   POST /{package}.{Service}/{Method}
//!   Content-Type: application/json | application/proto
//!   Body: encoded request
//!   Errors: HTTP 4xx/5xx + JSON `{ "code": "...", "message": "..." }`

use std::time::Duration;

use axum::{
    body::Bytes,
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use serde::Serialize;
use std::sync::Arc;
use tower_http::compression::CompressionLayer;
use tower_http::timeout::TimeoutLayer;

use crate::context::AppContext;
use crate::handlers::{
    engine::EngineHandler,
    stats::{self, StatsHandler},
};

/// Legacy state bundle used by tests created before `AppContext` existed.
#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<EngineHandler>,
    pub stats: Arc<StatsHandler>,
}

/// Build a router with the legacy AppState (tests-only).
pub fn build_router_with_state(state: AppState) -> Router {
    let ctx = AppContext {
        pool: None,
        engine: state.engine,
        stats: state.stats,
        metrics: None,
    };
    build_router_with_context(ctx)
}

/// Build a router with sensible defaults (no DB). Used by ad-hoc callers
/// and by the legacy `build_router()` fn name kept for old tests.
pub fn build_router() -> Router {
    build_router_with_context(AppContext::in_memory_for_tests())
}

/// The canonical router constructor.
pub fn build_router_with_context(ctx: AppContext) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/metrics", get(metrics_endpoint))
        // Engine
        .route(
            "/parley.engine.v1.EngineService/RenderProfileCard",
            post(render_profile_card),
        )
        .route(
            "/parley.engine.v1.EngineService/RenderAccountCard",
            post(render_account_card),
        )
        .route(
            "/parley.engine.v1.EngineService/RenderBadgeStrip",
            post(render_badge_strip),
        )
        // Stats
        .route(
            "/parley.stats.v1.StatsService/FetchStats",
            post(fetch_stats_rpc),
        )
        .route(
            "/parley.stats.v1.StatsService/FetchStatsCollection",
            post(fetch_stats_collection_rpc),
        )
        .route("/stats/{username}", get(stats::stats_get))
        // Identity
        .route(
            "/parley.identity.v1.IdentityService/LinkAccount",
            post(crate::handlers::identity::link_account_rpc),
        )
        .route(
            "/parley.identity.v1.IdentityService/UnlinkAccount",
            post(crate::handlers::identity::unlink_account_rpc),
        )
        .route(
            "/parley.identity.v1.IdentityService/LookupByDiscord",
            post(crate::handlers::identity::lookup_by_discord_rpc),
        )
        .route(
            "/parley.identity.v1.IdentityService/LookupByUsername",
            post(crate::handlers::identity::lookup_by_username_rpc),
        )
        // Guild settings
        .route(
            "/parley.guild.v1.GuildSettingsService/GetGuildSettings",
            post(crate::handlers::guild_settings::get_guild_settings_rpc),
        )
        .route(
            "/parley.guild.v1.GuildSettingsService/UpsertGuildSettings",
            post(crate::handlers::guild_settings::upsert_guild_settings_rpc),
        )
        .route(
            "/parley.guild.v1.GuildSettingsService/GetMatchmakingRules",
            post(crate::handlers::guild_settings::get_matchmaking_rules_rpc),
        )
        .route(
            "/parley.guild.v1.GuildSettingsService/UpsertMatchmakingRules",
            post(crate::handlers::guild_settings::upsert_matchmaking_rules_rpc),
        )
        .route(
            "/parley.guild.v1.GuildSettingsService/GetNotificationSettings",
            post(crate::handlers::guild_settings::get_notification_settings_rpc),
        )
        .route(
            "/parley.guild.v1.GuildSettingsService/UpsertNotificationSettings",
            post(crate::handlers::guild_settings::upsert_notification_settings_rpc),
        )
        .route(
            "/parley.guild.v1.GuildSettingsService/GetMatchQuotas",
            post(crate::handlers::guild_settings::get_match_quotas_rpc),
        )
        .route(
            "/parley.guild.v1.GuildSettingsService/UpsertMatchQuotas",
            post(crate::handlers::guild_settings::upsert_match_quotas_rpc),
        )
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::new(Duration::from_secs(30)))
        .with_state(ctx)
}

async fn health() -> &'static str {
    "OK"
}

async fn ready(State(ctx): State<AppContext>) -> Response {
    match ctx.readiness_check().await {
        Ok(()) => (StatusCode::OK, "READY").into_response(),
        Err(e) => {
            tracing::warn!(error = %e, "readiness probe failed");
            (StatusCode::SERVICE_UNAVAILABLE, format!("NOT READY: {e}")).into_response()
        }
    }
}

async fn metrics_endpoint(State(ctx): State<AppContext>) -> Response {
    match ctx.render_metrics() {
        Some(body) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
            body,
        )
            .into_response(),
        None => (StatusCode::SERVICE_UNAVAILABLE, "metrics disabled").into_response(),
    }
}

#[derive(Serialize)]
struct ConnectError {
    code: String,
    message: String,
}

#[derive(Clone, Copy)]
pub(crate) enum Encoding {
    Json,
    Proto,
}

pub(crate) fn detect_encoding(headers: &HeaderMap) -> Encoding {
    match headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
    {
        Some(ct) if ct.starts_with("application/proto") => Encoding::Proto,
        _ => Encoding::Json,
    }
}

pub(crate) fn encode_error(status: StatusCode, code: &str, msg: impl Into<String>) -> Response {
    let body = serde_json::to_vec(&ConnectError {
        code: code.to_string(),
        message: msg.into(),
    })
    .unwrap_or_else(|_| b"{}".to_vec());
    (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}

pub(crate) fn encode_ok<T: prost::Message + serde::Serialize>(msg: &T, enc: Encoding) -> Response {
    match enc {
        Encoding::Json => {
            let body = match serde_json::to_vec(msg) {
                Ok(b) => b,
                Err(e) => {
                    return encode_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal",
                        e.to_string(),
                    )
                }
            };
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/json")],
                body,
            )
                .into_response()
        }
        Encoding::Proto => {
            let mut buf = Vec::with_capacity(msg.encoded_len());
            if let Err(e) = msg.encode(&mut buf) {
                return encode_error(StatusCode::INTERNAL_SERVER_ERROR, "internal", e.to_string());
            }
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/proto")],
                buf,
            )
                .into_response()
        }
    }
}

pub(crate) fn decode_body<T: prost::Message + Default + serde::de::DeserializeOwned>(
    enc: Encoding,
    body: &[u8],
) -> Result<T, Response> {
    match enc {
        Encoding::Json => serde_json::from_slice::<T>(body)
            .map_err(|e| encode_error(StatusCode::BAD_REQUEST, "invalid_argument", e.to_string())),
        Encoding::Proto => T::decode(body)
            .map_err(|e| encode_error(StatusCode::BAD_REQUEST, "invalid_argument", e.to_string())),
    }
}

use engine::proto::engine::v1::{
    AccountCardRequest, BadgeStripRequest, ImageResponse, ProfileCardRequest,
};

async fn render_profile_card(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: ProfileCardRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let resp: ImageResponse = ctx.engine.render_profile_card(req).await;
    encode_ok(&resp, enc)
}

async fn render_account_card(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: AccountCardRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let resp: ImageResponse = ctx.engine.render_account_card(req).await;
    encode_ok(&resp, enc)
}

async fn render_badge_strip(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: BadgeStripRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let resp: ImageResponse = ctx.engine.render_badge_strip(req).await;
    encode_ok(&resp, enc)
}

use stats_scraper::proto::stats::v1::{
    FetchStatsCollectionRequest, FetchStatsCollectionResponse, FetchStatsRequest,
    FetchStatsResponse,
};

async fn fetch_stats_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: FetchStatsRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let resp: FetchStatsResponse = ctx.stats.fetch_stats_rpc(req).await;
    encode_ok(&resp, enc)
}

async fn fetch_stats_collection_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: FetchStatsCollectionRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let resp: FetchStatsCollectionResponse = ctx.stats.fetch_stats_collection_rpc(req).await;
    encode_ok(&resp, enc)
}
