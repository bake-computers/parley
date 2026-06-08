use axum::{body::Bytes, extract::State, http::HeaderMap, response::Response};

use crate::connect::{decode_body, detect_encoding, encode_ok};
use crate::context::AppContext;
use crate::leaderboard::{LeaderboardEntry, LeaderboardKind};
use crate::proto::leaderboard::v1::{
    GetLeaderboardRequest, GetLeaderboardResponse, GetPlayerRankRequest, GetPlayerRankResponse,
    LeaderboardEntry as ProtoEntry, LeaderboardType,
};

fn map_leaderboard_type(t: i32) -> LeaderboardKind {
    match LeaderboardType::try_from(t).unwrap_or(LeaderboardType::Unspecified) {
        LeaderboardType::Elo => LeaderboardKind::Elo,
        LeaderboardType::WinRate => LeaderboardKind::WinRate,
        LeaderboardType::RankPoints => LeaderboardKind::RankPoints,
        _ => LeaderboardKind::Elo,
    }
}

fn proto_entry(e: LeaderboardEntry) -> ProtoEntry {
    ProtoEntry {
        player_id: e.player_id.clone(),
        username: e.player_id,
        rank: e.rank,
        score: e.score,
        matches: 0,
        wins: 0,
        losses: 0,
        win_rate: 0.0,
    }
}

pub async fn get_leaderboard_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetLeaderboardRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let lb = match &ctx.leaderboard {
        Some(lb) => lb,
        None => {
            return crate::connect::encode_error(
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                "unavailable",
                "leaderboard not configured (set REDIS_URL)",
            );
        }
    };

    let game = match crate::proto::common::v1::Game::try_from(req.game) {
        Ok(crate::proto::common::v1::Game::R6) | Ok(crate::proto::common::v1::Game::BrawlStars) => {
            super::super::backends::Game::R6
        }
        _ => super::super::backends::Game::R6,
    };

    let kind = map_leaderboard_type(req.r#type);
    let limit = req.limit.clamp(1, 500) as isize;
    let offset = (req.offset.max(0)) as isize;

    let entries = lb.top(game, &req.guild_id, kind, limit, offset).await;
    let total = lb.count(game, &req.guild_id, kind).await;

    let resp = GetLeaderboardResponse {
        entries: entries.into_iter().map(proto_entry).collect(),
        total_count: total,
    };

    encode_ok(&resp, enc)
}

pub async fn get_player_rank_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetPlayerRankRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let lb = match &ctx.leaderboard {
        Some(lb) => lb,
        None => {
            return crate::connect::encode_error(
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                "unavailable",
                "leaderboard not configured (set REDIS_URL)",
            );
        }
    };

    let game = match crate::proto::common::v1::Game::try_from(req.game) {
        Ok(crate::proto::common::v1::Game::R6) | Ok(crate::proto::common::v1::Game::BrawlStars) => {
            super::super::backends::Game::R6
        }
        _ => super::super::backends::Game::R6,
    };

    let kind = map_leaderboard_type(req.r#type);
    let entry = lb
        .player_rank(game, &req.guild_id, kind, &req.player_id)
        .await
        .map(proto_entry);

    let resp = GetPlayerRankResponse { entry };
    encode_ok(&resp, enc)
}
