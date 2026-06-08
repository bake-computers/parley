//! Queue and match lifecycle RPC handlers.

use axum::{body::Bytes, extract::State, http::HeaderMap, response::Response};

use crate::connect::{decode_body, detect_encoding, encode_ok};
use crate::context::AppContext;
use crate::db::Game as DbGame;
use crate::db::matchmaking_repos::{MatchRepo, MatchmakingQueueRepo, QUEUE_STATUS_WAITING};
use crate::db::models::{NewMatch, NewMatchParticipant};
use crate::db::repos::{GuildMembershipRepo, GuildSettingsRepo, now_ms};
use crate::matchmaking::eligibility::load_eligibility;
use crate::matchmaking::players::{LoadedPlayer, load_players};
use crate::matchmaking::queue::{create_stack, try_form_match};
use crate::matchmaking::{partition_teams, update_rating};
use crate::proto::common::v1::{Error as ProtoError, Game as ProtoGame};
use crate::proto::matchmaking::v1::{
    CreateCustomMatchRequest, CreateCustomMatchResponse, GetMatchRequest, GetMatchResponse,
    GetQueueStatusRequest, GetQueueStatusResponse, JoinQueueRequest, JoinQueueResponse,
    LeaveQueueRequest, LeaveQueueResponse, Match as ProtoMatch,
    MatchParticipant as ProtoMatchParticipant, ReportMatchResultRequest, ReportMatchResultResponse,
    TeamAssignment,
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

fn resolve_team_size(req_team_size: i32, guild_format: Option<&str>) -> usize {
    if req_team_size > 0 {
        req_team_size as usize
    } else {
        crate::matchmaking::parse_team_size(guild_format)
    }
}

fn assignments_from_partition(
    players: &[LoadedPlayer],
    team_a: &[usize],
    team_b: &[usize],
) -> (Vec<TeamAssignment>, Vec<TeamAssignment>) {
    let to_assignment = |idx: usize| TeamAssignment {
        discord_user_id: players[idx].member.discord_user_id.clone(),
        player_id: players[idx].member.player_id,
        username: players[idx].member.username.clone(),
        platform: players[idx].member.platform.clone(),
        balance_rating: players[idx].rated.cpr,
        mu: players[idx].rated.mu,
        phi: players[idx].rated.phi,
        cpr: players[idx].rated.cpr,
    };
    (
        team_a.iter().map(|&i| to_assignment(i)).collect(),
        team_b.iter().map(|&i| to_assignment(i)).collect(),
    )
}

pub async fn join_queue_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: JoinQueueRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &JoinQueueResponse {
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
    if req.guild_id.trim().is_empty() || req.channel_id.trim().is_empty() {
        return fail(
            "InvalidArgument",
            "guild_id and channel_id are required".into(),
        );
    }
    if req.captain_discord_user_id.trim().is_empty() {
        return fail(
            "InvalidArgument",
            "captain_discord_user_id is required".into(),
        );
    }

    let mut discord_ids = if req.discord_user_ids.is_empty() {
        vec![req.captain_discord_user_id.clone()]
    } else {
        req.discord_user_ids.clone()
    };
    if !discord_ids.contains(&req.captain_discord_user_id) {
        discord_ids.insert(0, req.captain_discord_user_id.clone());
    }

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool checkout: {e}")),
    };

    if MatchmakingQueueRepo::find_active_for_captain(&mut conn, game, &req.captain_discord_user_id)
        .await
        .unwrap_or(None)
        .is_some()
    {
        return fail("FailedPrecondition", "already in queue".into());
    }
    for id in &discord_ids {
        if MatchmakingQueueRepo::find_active_for_participant(&mut conn, game, id)
            .await
            .unwrap_or(None)
            .is_some()
        {
            return fail(
                "FailedPrecondition",
                format!("player {id} already in queue"),
            );
        }
    }

    let settings = GuildSettingsRepo::get(&mut conn, &req.guild_id, game)
        .await
        .unwrap_or(None);
    let team_size = resolve_team_size(
        req.team_size,
        settings
            .as_ref()
            .and_then(|s| s.default_team_format.as_deref()),
    ) as i32;

    if discord_ids.len() > team_size as usize {
        return fail(
            "InvalidArgument",
            format!(
                "party size {} exceeds team_size {}",
                discord_ids.len(),
                team_size
            ),
        );
    }

    let eligibility = match load_eligibility(&mut conn, game, &req.guild_id).await {
        Ok(e) => e,
        Err(msg) => return fail("Internal", msg),
    };

    let players = match load_players(&ctx, &mut conn, game, &req.guild_id, &discord_ids).await {
        Ok(p) => p,
        Err(msg) => return fail("InvalidArgument", msg),
    };
    let members: Vec<_> = players.iter().map(|p| p.member.clone()).collect();
    if let Err(msg) = crate::matchmaking::eligibility::check_queue_eligibility(
        &mut conn,
        game,
        &req.guild_id,
        &discord_ids,
        &members,
        &eligibility,
    )
    .await
    {
        return fail("FailedPrecondition", msg);
    }

    let (queue, _) = match create_stack(
        &mut conn,
        game,
        &req.guild_id,
        &req.channel_id,
        &req.captain_discord_user_id,
        team_size,
        &players,
    )
    .await
    {
        Ok(q) => q,
        Err(msg) => return fail("Internal", msg),
    };

    if let Ok(Some(formed)) = try_form_match(
        &ctx,
        &mut conn,
        game,
        &req.guild_id,
        &req.channel_id,
        &req.captain_discord_user_id,
        team_size,
        &eligibility,
    )
    .await
    {
        let (team_a, team_b) = assignments_from_partition(
            &formed.players,
            &formed.partition.team_a,
            &formed.partition.team_b,
        );
        return encode_ok(
            &JoinQueueResponse {
                success: true,
                status: "matched".into(),
                queue_id: queue.id,
                match_id: formed.match_id,
                team_a,
                team_b,
                win_probability: formed.partition.win_probability,
                pool_waiting_players: 0,
                error: None,
            },
            enc,
        );
    }

    let (waiting_players, _) =
        MatchmakingQueueRepo::pool_stats(&mut conn, game, &req.guild_id, team_size)
            .await
            .unwrap_or((0, 0));

    encode_ok(
        &JoinQueueResponse {
            success: true,
            status: QUEUE_STATUS_WAITING.into(),
            queue_id: queue.id,
            match_id: 0,
            pool_waiting_players: waiting_players,
            error: None,
            ..Default::default()
        },
        enc,
    )
}

pub async fn leave_queue_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: LeaveQueueRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &LeaveQueueResponse {
                success: false,
                error: Some(err(code, msg)),
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

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool checkout: {e}")),
    };

    let active = match MatchmakingQueueRepo::find_active_for_captain(
        &mut conn,
        game,
        &req.captain_discord_user_id,
    )
    .await
    {
        Ok(q) => q,
        Err(e) => return fail("Internal", format!("lookup: {e}")),
    };

    let Some(queue) = active else {
        return fail("NotFound", "no active queue".into());
    };

    match MatchmakingQueueRepo::cancel(&mut conn, queue.id).await {
        Ok(Some(_)) => encode_ok(
            &LeaveQueueResponse {
                success: true,
                error: None,
            },
            enc,
        ),
        Ok(None) => fail("NotFound", "queue not found or not waiting".into()),
        Err(e) => fail("Internal", format!("cancel: {e}")),
    }
}

pub async fn get_queue_status_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetQueueStatusRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &GetQueueStatusResponse {
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

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool checkout: {e}")),
    };

    let settings = GuildSettingsRepo::get(&mut conn, &req.guild_id, game)
        .await
        .unwrap_or(None);
    let team_size = resolve_team_size(
        req.team_size,
        settings
            .as_ref()
            .and_then(|s| s.default_team_format.as_deref()),
    ) as i32;

    let active =
        MatchmakingQueueRepo::find_active_for_participant(&mut conn, game, &req.discord_user_id)
            .await
            .unwrap_or(None);

    let (waiting_players, waiting_stacks) =
        MatchmakingQueueRepo::pool_stats(&mut conn, game, &req.guild_id, team_size)
            .await
            .unwrap_or((0, 0));

    let (status, queue_id, match_id) = match active {
        Some(q) => (q.status, q.id, q.matched_match_id.unwrap_or(0)),
        None => ("idle".into(), 0, 0),
    };

    encode_ok(
        &GetQueueStatusResponse {
            success: true,
            status,
            queue_id,
            match_id,
            pool_waiting_players: waiting_players,
            pool_waiting_stacks: waiting_stacks,
            error: None,
        },
        enc,
    )
}

pub async fn create_custom_match_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: CreateCustomMatchRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &CreateCustomMatchResponse {
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

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool checkout: {e}")),
    };

    let settings = GuildSettingsRepo::get(&mut conn, &req.guild_id, game)
        .await
        .unwrap_or(None);

    let team_size = resolve_team_size(
        req.team_size,
        settings
            .as_ref()
            .and_then(|s| s.default_team_format.as_deref()),
    );
    let expected = team_size * 2;
    if req.discord_user_ids.len() != expected {
        return fail(
            "InvalidArgument",
            format!("expected {expected} players for team_size {team_size}"),
        );
    }

    let eligibility = match load_eligibility(&mut conn, game, &req.guild_id).await {
        Ok(e) => e,
        Err(msg) => return fail("Internal", msg),
    };

    let players =
        match load_players(&ctx, &mut conn, game, &req.guild_id, &req.discord_user_ids).await {
            Ok(p) => p,
            Err(msg) => return fail("InvalidArgument", msg),
        };
    let members: Vec<_> = players.iter().map(|p| p.member.clone()).collect();
    if let Err(msg) = crate::matchmaking::eligibility::check_queue_eligibility(
        &mut conn,
        game,
        &req.guild_id,
        &req.discord_user_ids,
        &members,
        &eligibility,
    )
    .await
    {
        return fail("FailedPrecondition", msg);
    }

    let rated: Vec<_> = players.iter().map(|p| p.rated.clone()).collect();
    let partition = match partition_teams(&rated, team_size) {
        Some(p) => p,
        None => return fail("Internal", "team partition failed".into()),
    };

    let now = now_ms();
    let team_a_cpr: f64 = partition.team_a.iter().map(|&i| rated[i].cpr).sum();
    let team_b_cpr: f64 = partition.team_b.iter().map(|&i| rated[i].cpr).sum();
    let team_a_seed: f64 = partition
        .team_a
        .iter()
        .map(|&i| players[i].seeds.score)
        .sum();
    let team_b_seed: f64 = partition
        .team_b
        .iter()
        .map(|&i| players[i].seeds.score)
        .sum();

    let match_row = NewMatch {
        game,
        guild_id: &req.guild_id,
        channel_id: &req.channel_id,
        message_id: "pending",
        created_by_discord_user_id: &req.created_by_discord_user_id,
        status: "active",
        match_type: "internal",
        opponent_guild_id: None,
        opponent_channel_id: None,
        opponent_message_id: None,
        opponent_captain_discord_user_id: None,
        team_a_seed_total: team_a_seed,
        team_b_seed_total: team_b_seed,
        seed_gap: (team_a_seed - team_b_seed).abs(),
        winning_team: None,
        resolution_type: "played",
        team_a_balance_total: team_a_cpr,
        team_b_balance_total: team_b_cpr,
        balance_gap: partition.balance_gap,
        created_at: now,
        updated_at: now,
    };

    let mut parts = Vec::new();
    for (slot, &idx) in partition.team_a.iter().enumerate() {
        let p = &players[idx];
        parts.push(NewMatchParticipant {
            game,
            match_id: 0,
            discord_user_id: &p.member.discord_user_id,
            player_id: p.member.player_id,
            team: "a",
            slot: slot as i32,
            seed_rank_points: p.seeds.rank_points,
            seed_kd_ratio: p.seeds.kd_ratio,
            seed_kost: p.seeds.kost,
            seed_kpr: p.seeds.kpr,
            seed_headshot_percentage: p.seeds.headshot_percentage,
            seed_score: p.seeds.score,
            balance_rating: p.rated.cpr,
            kills: None,
            deaths: None,
            created_at: now,
            updated_at: now,
        });
    }
    for (slot, &idx) in partition.team_b.iter().enumerate() {
        let p = &players[idx];
        parts.push(NewMatchParticipant {
            game,
            match_id: 0,
            discord_user_id: &p.member.discord_user_id,
            player_id: p.member.player_id,
            team: "b",
            slot: slot as i32,
            seed_rank_points: p.seeds.rank_points,
            seed_kd_ratio: p.seeds.kd_ratio,
            seed_kost: p.seeds.kost,
            seed_kpr: p.seeds.kpr,
            seed_headshot_percentage: p.seeds.headshot_percentage,
            seed_score: p.seeds.score,
            balance_rating: p.rated.cpr,
            kills: None,
            deaths: None,
            created_at: now,
            updated_at: now,
        });
    }

    let (m, _) = match MatchRepo::create(&mut conn, match_row, parts).await {
        Ok(row) => row,
        Err(e) => return fail("Internal", format!("create match: {e}")),
    };

    let (team_a, team_b) =
        assignments_from_partition(&players, &partition.team_a, &partition.team_b);

    encode_ok(
        &CreateCustomMatchResponse {
            success: true,
            match_id: m.id,
            team_a,
            team_b,
            win_probability: partition.win_probability,
            balance_gap: partition.balance_gap,
            error: None,
        },
        enc,
    )
}

fn match_to_proto(
    m: &crate::db::models::MatchRow,
    parts: &[crate::db::models::MatchParticipant],
) -> ProtoMatch {
    ProtoMatch {
        id: m.id,
        guild_id: m.guild_id.clone(),
        channel_id: m.channel_id.clone(),
        status: m.status.clone(),
        match_type: m.match_type.clone(),
        winning_team: m.winning_team.clone().unwrap_or_default(),
        balance_gap: m.balance_gap,
        created_at_ms: m.created_at,
        participants: parts
            .iter()
            .map(|p| ProtoMatchParticipant {
                discord_user_id: p.discord_user_id.clone(),
                player_id: p.player_id,
                team: p.team.clone(),
                slot: p.slot,
                username: String::new(),
                balance_rating: p.balance_rating,
            })
            .collect(),
    }
}

pub async fn report_match_result_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: ReportMatchResultRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &ReportMatchResultResponse {
                success: false,
                error: Some(err(code, msg)),
                ..Default::default()
            },
            enc,
        )
    };

    let winning = req.winning_team.trim().to_ascii_lowercase();
    if winning != "a" && winning != "b" {
        return fail("InvalidArgument", "winning_team must be 'a' or 'b'".into());
    }

    let Some(pool) = ctx.pool.clone() else {
        return fail("FailedPrecondition", "DATABASE_URL not configured".into());
    };
    let Some(game) = proto_game_to_db(req.game) else {
        return fail("InvalidArgument", "game must be R6".into());
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool checkout: {e}")),
    };

    let m = match MatchRepo::get(&mut conn, game, req.match_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return fail("NotFound", "match not found".into()),
        Err(e) => return fail("Internal", format!("get match: {e}")),
    };

    let parts = match MatchRepo::participants(&mut conn, req.match_id).await {
        Ok(p) => p,
        Err(e) => return fail("Internal", format!("participants: {e}")),
    };

    let lobby_cpr = if parts.is_empty() {
        0.0
    } else {
        parts.iter().map(|p| p.balance_rating).sum::<f64>() / parts.len() as f64
    };

    let team_a: Vec<_> = parts.iter().filter(|p| p.team == "a").collect();
    let team_b: Vec<_> = parts.iter().filter(|p| p.team == "b").collect();

    let opp_mu_a = if team_b.is_empty() {
        1000.0
    } else {
        team_b.len() as f64 * 1000.0 / team_b.len() as f64
    };
    let opp_mu_b = if team_a.is_empty() {
        1000.0
    } else {
        team_a.len() as f64 * 1000.0 / team_a.len() as f64
    };

    for p in &parts {
        let membership = GuildMembershipRepo::find_many_by_discord_ids(
            &mut conn,
            game,
            &m.guild_id,
            std::slice::from_ref(&p.discord_user_id),
        )
        .await
        .unwrap_or_default();
        let Some(member) = membership.first() else {
            continue;
        };

        let (won, opp_mu, opp_phi) = if p.team == winning {
            if p.team == "a" {
                (true, opp_mu_b, 350.0)
            } else {
                (true, opp_mu_a, 350.0)
            }
        } else if p.team == "a" {
            (false, opp_mu_b, 350.0)
        } else {
            (false, opp_mu_a, 350.0)
        };

        let outcome = if won { 1.0 } else { 0.0 };
        let (new_mu, new_phi) = update_rating(
            member.internal_elo,
            member.rating_deviation,
            opp_mu,
            opp_phi,
            outcome,
            p.balance_rating,
            lobby_cpr,
        );
        let _ = GuildMembershipRepo::update_rating(
            &mut conn,
            game,
            &m.guild_id,
            &p.discord_user_id,
            new_mu,
            new_phi,
            won,
        )
        .await;
    }

    let completed = match MatchRepo::complete(&mut conn, game, req.match_id, &winning).await {
        Ok(Some(row)) => row,
        Ok(None) => return fail("NotFound", "match not found".into()),
        Err(e) => return fail("Internal", format!("complete: {e}")),
    };

    let updated_parts = MatchRepo::participants(&mut conn, req.match_id)
        .await
        .unwrap_or_default();

    encode_ok(
        &ReportMatchResultResponse {
            success: true,
            r#match: Some(match_to_proto(&completed, &updated_parts)),
            error: None,
        },
        enc,
    )
}

pub async fn get_match_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetMatchRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &GetMatchResponse {
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

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool checkout: {e}")),
    };

    let m = match MatchRepo::get(&mut conn, game, req.match_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return fail("NotFound", "match not found".into()),
        Err(e) => return fail("Internal", format!("get: {e}")),
    };
    let parts = MatchRepo::participants(&mut conn, req.match_id)
        .await
        .unwrap_or_default();

    encode_ok(
        &GetMatchResponse {
            success: true,
            r#match: Some(match_to_proto(&m, &parts)),
            error: None,
        },
        enc,
    )
}
