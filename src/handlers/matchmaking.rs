//! MatchmakingService — team balancing and guild roster listing.

use std::collections::HashMap;

use axum::{body::Bytes, extract::State, http::HeaderMap, response::Response};
use sha2::{Digest, Sha256};

use crate::connect::{decode_body, detect_encoding, encode_ok};
use crate::context::AppContext;
use crate::db::Game as DbGame;
use crate::db::models::PlayerStatSnapshot;
use crate::db::repos::{
    GuildMatchmakingRulesRepo, GuildMemberRow, GuildMembershipRepo, GuildSettingsRepo,
    PlayerStatSnapshotRepo,
};
use crate::matchmaking::{
    PlayerMatchStats, PopulationNorms, RatedPlayer, RawPlayerStats, calculate_cpr, parse_team_size,
    partition_teams,
};
use crate::proto::common::v1::{Error as ProtoError, Game as ProtoGame};
use crate::proto::matchmaking::v1::{
    BuildTeamsRequest, BuildTeamsResponse, GuildMember, ListGuildMembersRequest,
    ListGuildMembersResponse, TeamAssignment,
};

fn proto_game_to_db(v: i32) -> Option<DbGame> {
    match ProtoGame::try_from(v).unwrap_or(ProtoGame::Unspecified) {
        ProtoGame::R6 => Some(DbGame::R6),
        ProtoGame::Unspecified => None,
        _ => None,
    }
}

fn err(code: &str, msg: impl Into<String>) -> ProtoError {
    ProtoError {
        code: code.to_string(),
        message: msg.into(),
    }
}

fn snapshot_metadata_f64(meta: &Option<serde_json::Value>, key: &str) -> f64 {
    meta.as_ref()
        .and_then(|v| v.get(key))
        .and_then(|v| v.as_f64().or_else(|| v.as_i64().map(|n| n as f64)))
        .unwrap_or(0.0)
}

fn raw_stats_from_snapshot(snap: &PlayerStatSnapshot) -> RawPlayerStats {
    let rounds = snapshot_metadata_f64(&snap.metadata, "rounds_played");
    let survival_rounds = snapshot_metadata_f64(&snap.metadata, "survival_rounds");
    let kpr = if rounds > 0.0 {
        snap.kills as f64 / rounds
    } else {
        0.0
    };
    let survival_rate = if rounds > 0.0 {
        survival_rounds / rounds * 100.0
    } else {
        0.0
    };

    RawPlayerStats {
        kd: snap.kd_ratio,
        win_rate: snap.win_rate,
        kpr,
        mmr: snap.rank_points as f64,
        kost: snap.kost,
        survival_rate,
        hs_percentage: snap.headshot_percentage,
        tk_penalty: 0.0,
    }
}

async fn compute_norms(
    ctx: &AppContext,
    conn: &mut diesel_async::AsyncPgConnection,
    game: DbGame,
    guild_id: &str,
) -> PopulationNorms {
    if let Some(cache) = &ctx.guild_cache
        && let Some(norms) = cache.get_norms(game, guild_id).await
    {
        return norms;
    }

    let members = GuildMembershipRepo::list_for_guild(conn, game, guild_id)
        .await
        .unwrap_or_default();
    let player_ids: Vec<i32> = members.iter().map(|m| m.player_id).collect();
    let snapshots = PlayerStatSnapshotRepo::latest_for_players(conn, game, &player_ids)
        .await
        .unwrap_or_default();

    let samples: Vec<RawPlayerStats> = snapshots.iter().map(raw_stats_from_snapshot).collect();
    let norms = PopulationNorms::from_samples(&samples);

    if let Some(cache) = &ctx.guild_cache {
        cache.set_norms(game, guild_id, norms).await;
    }

    norms
}

fn hash_discord_ids(ids: &[String]) -> String {
    let mut sorted = ids.to_vec();
    sorted.sort();
    let joined = sorted.join(",");
    let digest: hmac::digest::generic_array::GenericArray<
        u8,
        hmac::digest::typenum::UInt<
            hmac::digest::typenum::UInt<
                hmac::digest::typenum::UInt<
                    hmac::digest::typenum::UInt<
                        hmac::digest::typenum::UInt<
                            hmac::digest::typenum::UInt<
                                hmac::digest::typenum::UTerm,
                                hmac::digest::consts::B1,
                            >,
                            hmac::digest::consts::B0,
                        >,
                        hmac::digest::consts::B0,
                    >,
                    hmac::digest::consts::B0,
                >,
                hmac::digest::consts::B0,
            >,
            hmac::digest::consts::B0,
        >,
    > = Sha256::digest(joined.as_bytes());
    hex::encode(digest)
}

fn filter_members(rows: Vec<GuildMemberRow>, query: &str, limit: usize) -> Vec<GuildMemberRow> {
    let q = query.trim().to_ascii_lowercase();
    let mut out: Vec<GuildMemberRow> = if q.is_empty() {
        rows
    } else {
        rows.into_iter()
            .filter(|m| m.username.to_ascii_lowercase().starts_with(&q))
            .collect()
    };
    out.truncate(limit);
    out
}

pub async fn build_teams_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: BuildTeamsRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &BuildTeamsResponse {
                success: false,
                error: Some(err(code, msg)),
                ..Default::default()
            },
            enc,
        )
    };

    let Some(pool) = ctx.pool.clone() else {
        return fail("FailedPrecondition", "DATABASE_URL not configured".into());
    };
    let Some(game) = proto_game_to_db(req.game) else {
        return fail("InvalidArgument", "game must be R6".into());
    };
    if req.guild_id.trim().is_empty() {
        return fail("InvalidArgument", "guild_id is required".into());
    }
    if req.discord_user_ids.is_empty() {
        return fail(
            "InvalidArgument",
            "discord_user_ids must not be empty".into(),
        );
    }

    let ids_hash = hash_discord_ids(&req.discord_user_ids);
    if let Some(cache) = &ctx.guild_cache
        && let Some(cached) = cache
            .get_build_teams_cached::<BuildTeamsResponse>(game, &req.guild_id, &ids_hash)
            .await
    {
        return encode_ok(&cached, enc);
    }

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool checkout: {e}")),
    };

    let settings = GuildSettingsRepo::get(&mut conn, &req.guild_id, game)
        .await
        .unwrap_or(None);
    let team_size = if req.team_size > 0 {
        req.team_size as usize
    } else {
        parse_team_size(
            settings
                .as_ref()
                .and_then(|s| s.default_team_format.as_deref()),
        )
    };

    let expected_count = team_size * 2;
    if req.discord_user_ids.len() != expected_count {
        return fail(
            "InvalidArgument",
            format!(
                "expected {} discord_user_ids for team_size {}, got {}",
                expected_count,
                team_size,
                req.discord_user_ids.len()
            ),
        );
    }

    let unique: std::collections::HashSet<_> = req.discord_user_ids.iter().collect();
    if unique.len() != req.discord_user_ids.len() {
        return fail("InvalidArgument", "duplicate discord_user_ids".into());
    }

    let members = match GuildMembershipRepo::find_many_by_discord_ids(
        &mut conn,
        game,
        &req.guild_id,
        &req.discord_user_ids,
    )
    .await
    {
        Ok(m) => m,
        Err(e) => return fail("Internal", format!("load memberships: {e}")),
    };

    if members.len() != req.discord_user_ids.len() {
        return fail(
            "InvalidArgument",
            "one or more discord_user_ids are not registered in this guild".into(),
        );
    }

    let rules = GuildMatchmakingRulesRepo::get(&mut conn, &req.guild_id, game)
        .await
        .unwrap_or(None);
    if let Some(rules) = &rules {
        if let Some(platforms) = &rules.platforms {
            let allowed: std::collections::HashSet<_> =
                platforms.iter().map(|p| p.to_ascii_lowercase()).collect();
            if !allowed.is_empty() {
                for m in &members {
                    if !allowed.contains(&m.platform.to_ascii_lowercase()) {
                        return fail(
                            "FailedPrecondition",
                            format!("player {} platform {} not allowed", m.username, m.platform),
                        );
                    }
                }
            }
        }
        if rules.max_elo_gap > 0 {
            let min_elo = members
                .iter()
                .map(|m| m.internal_elo)
                .fold(f64::INFINITY, f64::min);
            let max_elo = members
                .iter()
                .map(|m| m.internal_elo)
                .fold(f64::NEG_INFINITY, f64::max);
            if max_elo - min_elo > rules.max_elo_gap as f64 {
                return fail(
                    "FailedPrecondition",
                    format!(
                        "elo gap {} exceeds max {}",
                        max_elo - min_elo,
                        rules.max_elo_gap
                    ),
                );
            }
        }
    }

    let norms = compute_norms(&ctx, &mut conn, game, &req.guild_id).await;
    let player_ids: Vec<i32> = members.iter().map(|m| m.player_id).collect();
    let snapshots = PlayerStatSnapshotRepo::latest_for_players(&mut conn, game, &player_ids)
        .await
        .unwrap_or_default();
    let snap_by_player: HashMap<i32, &PlayerStatSnapshot> =
        snapshots.iter().map(|s| (s.player_id, s)).collect();

    let mut rated: Vec<RatedPlayer> = Vec::with_capacity(members.len());
    let mut cprs: Vec<f64> = Vec::with_capacity(members.len());

    for m in &members {
        let match_stats = snap_by_player
            .get(&m.player_id)
            .map(|snap| PlayerMatchStats::from_raw(raw_stats_from_snapshot(snap), &norms))
            .unwrap_or_else(PlayerMatchStats::neutral);
        let cpr = calculate_cpr(&match_stats);
        cprs.push(cpr);
        rated.push(RatedPlayer {
            mu: m.internal_elo,
            phi: m.rating_deviation,
            cpr,
        });
    }

    let expected_lobby_cpr = if cprs.is_empty() {
        0.0
    } else {
        cprs.iter().sum::<f64>() / cprs.len() as f64
    };

    let partition = match partition_teams(&rated, team_size) {
        Some(p) => p,
        None => return fail("Internal", "team partition failed".into()),
    };

    let to_assignment = |idx: usize| -> TeamAssignment {
        let m = &members[idx];
        TeamAssignment {
            discord_user_id: m.discord_user_id.clone(),
            player_id: m.player_id,
            username: m.username.clone(),
            platform: m.platform.clone(),
            balance_rating: rated[idx].cpr,
            mu: rated[idx].mu,
            phi: rated[idx].phi,
            cpr: rated[idx].cpr,
        }
    };

    let resp = BuildTeamsResponse {
        success: true,
        team_a: partition.team_a.iter().map(|&i| to_assignment(i)).collect(),
        team_b: partition.team_b.iter().map(|&i| to_assignment(i)).collect(),
        win_probability: partition.win_probability,
        balance_gap: partition.balance_gap,
        expected_lobby_cpr,
        error: None,
    };

    if let Some(cache) = &ctx.guild_cache {
        cache
            .set_build_teams_cached(game, &req.guild_id, &ids_hash, &resp)
            .await;
    }

    encode_ok(&resp, enc)
}

pub async fn list_guild_members_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: ListGuildMembersRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &ListGuildMembersResponse {
                success: false,
                error: Some(err(code, msg)),
                ..Default::default()
            },
            enc,
        )
    };

    let Some(pool) = ctx.pool.clone() else {
        return fail("FailedPrecondition", "DATABASE_URL not configured".into());
    };
    let Some(game) = proto_game_to_db(req.game) else {
        return fail("InvalidArgument", "game must be R6".into());
    };
    if req.guild_id.trim().is_empty() {
        return fail("InvalidArgument", "guild_id is required".into());
    }

    let limit = if req.limit <= 0 {
        500
    } else {
        req.limit.clamp(1, 2000) as usize
    };

    let rows = if let Some(cache) = &ctx.guild_cache {
        if let Some(cached) = cache.get_members(game, &req.guild_id).await {
            filter_members(cached, &req.query, limit)
        } else {
            let mut conn = match pool.get().await {
                Ok(c) => c,
                Err(e) => return fail("Internal", format!("pool checkout: {e}")),
            };
            let loaded = GuildMembershipRepo::list_for_guild(&mut conn, game, &req.guild_id)
                .await
                .unwrap_or_default();
            cache.set_members(game, &req.guild_id, &loaded).await;
            filter_members(loaded, &req.query, limit)
        }
    } else {
        let mut conn = match pool.get().await {
            Ok(c) => c,
            Err(e) => return fail("Internal", format!("pool checkout: {e}")),
        };
        let loaded = GuildMembershipRepo::list_for_guild(&mut conn, game, &req.guild_id)
            .await
            .unwrap_or_default();
        filter_members(loaded, &req.query, limit)
    };

    let members: Vec<GuildMember> = rows
        .into_iter()
        .map(|m| GuildMember {
            discord_user_id: m.discord_user_id,
            player_id: m.player_id,
            username: m.username,
            platform: m.platform,
            internal_elo: m.internal_elo,
        })
        .collect();

    encode_ok(
        &ListGuildMembersResponse {
            success: true,
            members,
            error: None,
        },
        enc,
    )
}
