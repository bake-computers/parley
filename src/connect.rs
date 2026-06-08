//! Axum + ConnectRPC wiring.
//!
//! Connect envelope (unary):
//!   POST /{package}.{Service}/{Method}
//!   Content-Type: application/json | application/proto
//!   Body: encoded request
//!   Errors: HTTP 4xx/5xx + JSON `{ "code": "...", "message": "..." }`

use std::time::Duration;

use axum::{
    Router,
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Serialize;
use tower_http::compression::CompressionLayer;
use tower_http::timeout::TimeoutLayer;

use crate::context::AppContext;
use crate::handlers::stats;
use crate::logging::AxiomLogLayer;

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
        // User settings
        .route(
            "/parley.user.v1.UserSettingsService/GetUserSettings",
            post(crate::handlers::user_settings::get_user_settings_rpc),
        )
        .route(
            "/parley.user.v1.UserSettingsService/UpsertUserSettings",
            post(crate::handlers::user_settings::upsert_user_settings_rpc),
        )
        .route(
            "/parley.user.v1.UserSettingsService/ResolveLanguage",
            post(crate::handlers::user_settings::resolve_language_rpc),
        )
        .route(
            "/parley.user.v1.UserSettingsService/DeleteUserData",
            post(crate::handlers::user_settings::delete_user_data_rpc),
        )
        // Leaderboard
        .route(
            "/parley.leaderboard.v1.LeaderboardService/GetLeaderboard",
            post(crate::handlers::leaderboard::get_leaderboard_rpc),
        )
        .route(
            "/parley.leaderboard.v1.LeaderboardService/GetPlayerRank",
            post(crate::handlers::leaderboard::get_player_rank_rpc),
        )
        // Matchmaking
        .route(
            "/parley.matchmaking.v1.MatchmakingService/BuildTeams",
            post(crate::handlers::matchmaking::build_teams_rpc),
        )
        .route(
            "/parley.matchmaking.v1.MatchmakingService/ListGuildMembers",
            post(crate::handlers::matchmaking::list_guild_members_rpc),
        )
        .route(
            "/parley.matchmaking.v1.MatchmakingService/JoinQueue",
            post(crate::handlers::match_queue::join_queue_rpc),
        )
        .route(
            "/parley.matchmaking.v1.MatchmakingService/LeaveQueue",
            post(crate::handlers::match_queue::leave_queue_rpc),
        )
        .route(
            "/parley.matchmaking.v1.MatchmakingService/GetQueueStatus",
            post(crate::handlers::match_queue::get_queue_status_rpc),
        )
        .route(
            "/parley.matchmaking.v1.MatchmakingService/CreateCustomMatch",
            post(crate::handlers::match_queue::create_custom_match_rpc),
        )
        .route(
            "/parley.matchmaking.v1.MatchmakingService/ReportMatchResult",
            post(crate::handlers::match_queue::report_match_result_rpc),
        )
        .route(
            "/parley.matchmaking.v1.MatchmakingService/GetMatch",
            post(crate::handlers::match_queue::get_match_rpc),
        )
        // Tournaments
        .route(
            "/parley.tournament.v1.TournamentService/CreateTournament",
            post(crate::handlers::tournament::create_tournament_rpc),
        )
        .route(
            "/parley.tournament.v1.TournamentService/GetTournament",
            post(crate::handlers::tournament::get_tournament_rpc),
        )
        .route(
            "/parley.tournament.v1.TournamentService/ListTournaments",
            post(crate::handlers::tournament::list_tournaments_rpc),
        )
        .route(
            "/parley.tournament.v1.TournamentService/RegisterTeam",
            post(crate::handlers::tournament::register_team_rpc),
        )
        .route(
            "/parley.tournament.v1.TournamentService/UpdateTeamRoster",
            post(crate::handlers::tournament::update_team_roster_rpc),
        )
        .route(
            "/parley.tournament.v1.TournamentService/UnregisterTeam",
            post(crate::handlers::tournament::unregister_team_rpc),
        )
        .route(
            "/parley.tournament.v1.TournamentService/StartTournament",
            post(crate::handlers::tournament::start_tournament_rpc),
        )
        .route(
            "/parley.tournament.v1.TournamentService/ReportBracketResult",
            post(crate::handlers::tournament::report_bracket_result_rpc),
        )
        .route(
            "/parley.tournament.v1.TournamentService/CancelTournament",
            post(crate::handlers::tournament::cancel_tournament_rpc),
        )
        .layer(AxiomLogLayer::new(ctx.axiom.clone()))
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
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
        Some(ct) if ct.starts_with("application/connect+proto") => Encoding::Proto,
        Some(ct) if ct.starts_with("application/grpc+proto") => Encoding::Proto,
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
                    );
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

use crate::stats_proto::stats::v1::{
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
