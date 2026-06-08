//! TournamentService — tournament lifecycle and bracket management.

use axum::{body::Bytes, extract::State, http::HeaderMap, response::Response};

use crate::connect::{decode_body, detect_encoding, encode_ok};
use crate::context::AppContext;
use crate::db::Game as DbGame;
use crate::db::models::{NewTournament, NewTournamentTeam, NewTournamentTeamRoster};
use crate::db::repos::now_ms;
use crate::db::tournament_repos::{
    BracketMatchRepo, TEAM_STATUS_REGISTERED, TOURNAMENT_STATUS_CANCELLED,
    TOURNAMENT_STATUS_COMPLETED, TOURNAMENT_STATUS_IN_PROGRESS, TOURNAMENT_STATUS_OPEN,
    TournamentRepo, TournamentRosterRepo, TournamentTeamRepo,
};
use crate::matchmaking::players::load_players;
use crate::proto::common::v1::{Error as ProtoError, Game as ProtoGame};
use crate::proto::matchmaking::v1::TeamAssignment;
use crate::proto::tournament::v1::{
    BracketMatch as ProtoBracketMatch, BracketMatchResponse, CancelTournamentRequest,
    CreateTournamentRequest, GetTournamentRequest, ListTournamentsRequest, ListTournamentsResponse,
    RegisterTeamRequest, ReportBracketResultRequest, StartTournamentRequest, TeamResponse,
    Tournament as ProtoTournament, TournamentResponse, TournamentTeam as ProtoTournamentTeam,
    UnregisterTeamRequest, UpdateTeamRosterRequest,
};
use crate::tourney::bracket::{
    generate_double_elimination, generate_single_elimination, persist_bracket,
    seed_and_activate_teams,
};
use crate::tourney::{normalize_tournament_name, parse_tournament_format};

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

async fn build_tournament_proto(
    ctx: &AppContext,
    conn: &mut diesel_async::AsyncPgConnection,
    game: DbGame,
    tournament: &crate::db::models::Tournament,
) -> Result<ProtoTournament, String> {
    let teams = TournamentTeamRepo::list_for_tournament(conn, tournament.id)
        .await
        .map_err(|e| format!("teams: {e}"))?;
    let rosters = TournamentRosterRepo::for_tournament(conn, tournament.id)
        .await
        .map_err(|e| format!("rosters: {e}"))?;
    let brackets = BracketMatchRepo::list_for_tournament(conn, tournament.id)
        .await
        .map_err(|e| format!("brackets: {e}"))?;

    let mut proto_teams = Vec::new();
    for team in &teams {
        let team_roster: Vec<_> = rosters.iter().filter(|r| r.team_id == team.id).collect();
        let discord_ids: Vec<String> = team_roster
            .iter()
            .map(|r| r.discord_user_id.clone())
            .collect();
        let assignments = if discord_ids.is_empty() {
            Vec::new()
        } else {
            let loaded = load_players(ctx, conn, game, &team.guild_id, &discord_ids)
                .await
                .unwrap_or_default();
            loaded
                .into_iter()
                .map(|p| TeamAssignment {
                    discord_user_id: p.member.discord_user_id,
                    player_id: p.member.player_id,
                    username: p.member.username,
                    platform: p.member.platform,
                    balance_rating: p.rated.cpr,
                    mu: p.rated.mu,
                    phi: p.rated.phi,
                    cpr: p.rated.cpr,
                })
                .collect()
        };
        proto_teams.push(ProtoTournamentTeam {
            id: team.id,
            tournament_id: team.tournament_id,
            guild_id: team.guild_id.clone(),
            channel_id: team.channel_id.clone(),
            captain_discord_user_id: team.captain_discord_user_id.clone(),
            team_name: team.team_name.clone(),
            status: team.status.clone(),
            seed_number: team.seed_number.unwrap_or(0),
            stack_balance_average: team.stack_balance_average,
            roster: assignments,
        });
    }

    Ok(ProtoTournament {
        id: tournament.id,
        game: ProtoGame::R6 as i32,
        name: tournament.name.clone(),
        format: tournament.format.clone(),
        team_cap: tournament.team_cap,
        visibility: tournament.visibility.clone(),
        status: tournament.status.clone(),
        created_by_guild_id: tournament.created_by_guild_id.clone(),
        created_by_channel_id: tournament.created_by_channel_id.clone(),
        created_by_discord_user_id: tournament.created_by_discord_user_id.clone(),
        started_at_ms: tournament.started_at.unwrap_or(0),
        completed_at_ms: tournament.completed_at.unwrap_or(0),
        winner_team_id: tournament.winner_entry_id.unwrap_or(0),
        created_at_ms: tournament.created_at,
        updated_at_ms: tournament.updated_at,
        teams: proto_teams,
        bracket_matches: brackets
            .into_iter()
            .map(|b| ProtoBracketMatch {
                id: b.id,
                tournament_id: b.tournament_id,
                bracket: b.bracket,
                round_number: b.round_number,
                match_number: b.match_number,
                status: b.status,
                team_a_id: b.team_a_id.unwrap_or(0),
                team_b_id: b.team_b_id.unwrap_or(0),
                winner_team_id: b.winner_team_id.unwrap_or(0),
                loser_team_id: b.loser_team_id.unwrap_or(0),
                winner_to_match_id: b.winner_to_match_id.unwrap_or(0),
                winner_to_slot: b.winner_to_slot.unwrap_or_default(),
                loser_to_match_id: b.loser_to_match_id.unwrap_or(0),
                loser_to_slot: b.loser_to_slot.unwrap_or_default(),
                custom_match_id: b.custom_match_id.unwrap_or(0),
            })
            .collect(),
    })
}

pub async fn create_tournament_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: CreateTournamentRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &TournamentResponse {
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
    if req.name.trim().is_empty() || req.team_cap < 2 {
        return fail("InvalidArgument", "name and team_cap >= 2 required".into());
    }

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool: {e}")),
    };

    let now = now_ms();
    let visibility = if req.visibility.trim().is_empty() {
        "public"
    } else {
        req.visibility.trim()
    };
    let format = if req.format.trim().is_empty() {
        "5v5 single_elimination".to_string()
    } else {
        req.format.trim().to_string()
    };

    let row = NewTournament {
        game,
        name: &req.name,
        name_normalized: &normalize_tournament_name(&req.name),
        format: &format,
        team_cap: req.team_cap,
        visibility,
        status: TOURNAMENT_STATUS_OPEN,
        created_by_guild_id: &req.guild_id,
        created_by_channel_id: &req.channel_id,
        created_by_discord_user_id: &req.created_by_discord_user_id,
        hub_message_id: None,
        filled_at: None,
        auto_start_at: None,
        started_at: None,
        completed_at: None,
        winner_entry_id: None,
        created_at: now,
        updated_at: now,
    };

    let tournament = match TournamentRepo::create(&mut conn, row).await {
        Ok(t) => t,
        Err(e) => return fail("Internal", format!("create: {e}")),
    };

    let proto = match build_tournament_proto(&ctx, &mut conn, game, &tournament).await {
        Ok(p) => p,
        Err(msg) => return fail("Internal", msg),
    };

    encode_ok(
        &TournamentResponse {
            success: true,
            tournament: Some(proto),
            error: None,
        },
        enc,
    )
}

pub async fn get_tournament_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetTournamentRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &TournamentResponse {
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
        Err(e) => return fail("Internal", format!("pool: {e}")),
    };

    let tournament = match TournamentRepo::get(&mut conn, game, req.tournament_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "tournament not found".into()),
        Err(e) => return fail("Internal", format!("get: {e}")),
    };

    let proto = match build_tournament_proto(&ctx, &mut conn, game, &tournament).await {
        Ok(p) => p,
        Err(msg) => return fail("Internal", msg),
    };

    encode_ok(
        &TournamentResponse {
            success: true,
            tournament: Some(proto),
            error: None,
        },
        enc,
    )
}

pub async fn list_tournaments_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: ListTournamentsRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &ListTournamentsResponse {
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

    let limit = if req.limit <= 0 {
        50
    } else {
        req.limit.clamp(1, 200) as i64
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool: {e}")),
    };

    let rows = match TournamentRepo::list_for_guild(
        &mut conn,
        game,
        &req.guild_id,
        Some(&req.status),
        limit,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => return fail("Internal", format!("list: {e}")),
    };

    let mut tournaments = Vec::new();
    for t in &rows {
        if let Ok(proto) = build_tournament_proto(&ctx, &mut conn, game, t).await {
            tournaments.push(proto);
        }
    }

    encode_ok(
        &ListTournamentsResponse {
            success: true,
            tournaments,
            error: None,
        },
        enc,
    )
}

#[allow(clippy::too_many_arguments)]
async fn register_team_inner(
    ctx: &AppContext,
    conn: &mut diesel_async::AsyncPgConnection,
    game: DbGame,
    tournament_id: i32,
    guild_id: &str,
    channel_id: &str,
    captain: &str,
    team_name: &str,
    discord_user_ids: &[String],
) -> Result<crate::db::models::TournamentTeam, String> {
    let tournament = TournamentRepo::get(conn, game, tournament_id)
        .await
        .map_err(|e| format!("get tournament: {e}"))?
        .ok_or_else(|| "tournament not found".to_string())?;

    if tournament.status != TOURNAMENT_STATUS_OPEN {
        return Err("tournament is not open for registration".into());
    }

    let existing = TournamentTeamRepo::list_for_tournament(conn, tournament_id)
        .await
        .map_err(|e| format!("list teams: {e}"))?;
    if existing.len() >= tournament.team_cap as usize {
        return Err("tournament is full".into());
    }

    let (bracket_type, team_size) = parse_tournament_format(&tournament.format);
    let _ = bracket_type;
    if discord_user_ids.len() != team_size {
        return Err(format!(
            "expected {team_size} players for this tournament format"
        ));
    }

    let players = load_players(ctx, conn, game, guild_id, discord_user_ids).await?;
    let stack_total: f64 = players.iter().map(|p| p.rated.cpr).sum();
    let stack_avg = stack_total / players.len() as f64;
    let now = now_ms();

    let row = NewTournamentTeam {
        game,
        tournament_id,
        guild_id,
        channel_id,
        captain_discord_user_id: captain,
        team_name,
        team_name_normalized: &TournamentTeamRepo::normalize_team_name(team_name),
        status: TEAM_STATUS_REGISTERED,
        seed_number: None,
        stack_balance_total: stack_total,
        stack_balance_average: stack_avg,
        joined_at: now,
        eliminated_at: None,
        created_at: now,
        updated_at: now,
    };

    let roster: Vec<NewTournamentTeamRoster> = players
        .iter()
        .enumerate()
        .map(|(slot, p)| NewTournamentTeamRoster {
            game,
            tournament_id,
            team_id: 0,
            discord_user_id: &p.member.discord_user_id,
            player_id: p.member.player_id,
            slot: slot as i32,
            username: &p.member.username,
            platform: &p.member.platform,
            balance_rating: p.rated.cpr,
            seed_rank_points: p.seeds.rank_points,
            seed_kd_ratio: p.seeds.kd_ratio,
            seed_kost: p.seeds.kost,
            seed_kpr: p.seeds.kpr,
            seed_headshot_percentage: p.seeds.headshot_percentage,
            seed_score: p.seeds.score,
            created_at: now,
            updated_at: now,
        })
        .collect();

    let (team, _) = TournamentTeamRepo::register(conn, row, roster)
        .await
        .map_err(|e| format!("register: {e}"))?;
    Ok(team)
}

pub async fn register_team_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: RegisterTeamRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &TeamResponse {
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
        Err(e) => return fail("Internal", format!("pool: {e}")),
    };

    let team = match register_team_inner(
        &ctx,
        &mut conn,
        game,
        req.tournament_id,
        &req.guild_id,
        &req.channel_id,
        &req.captain_discord_user_id,
        &req.team_name,
        &req.discord_user_ids,
    )
    .await
    {
        Ok(t) => t,
        Err(msg) => return fail("FailedPrecondition", msg),
    };

    encode_ok(
        &TeamResponse {
            success: true,
            team: Some(ProtoTournamentTeam {
                id: team.id,
                tournament_id: team.tournament_id,
                guild_id: team.guild_id,
                channel_id: team.channel_id,
                captain_discord_user_id: team.captain_discord_user_id,
                team_name: team.team_name,
                status: team.status,
                seed_number: team.seed_number.unwrap_or(0),
                stack_balance_average: team.stack_balance_average,
                roster: Vec::new(),
            }),
            error: None,
        },
        enc,
    )
}

pub async fn update_team_roster_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: UpdateTeamRosterRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &TeamResponse {
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
        Err(e) => return fail("Internal", format!("pool: {e}")),
    };

    let team = match TournamentTeamRepo::get(&mut conn, game, req.team_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "team not found".into()),
        Err(e) => return fail("Internal", format!("get team: {e}")),
    };
    if team.captain_discord_user_id != req.captain_discord_user_id {
        return fail("PermissionDenied", "only captain can update roster".into());
    }

    let tournament = match TournamentRepo::get(&mut conn, game, req.tournament_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "tournament not found".into()),
        Err(e) => return fail("Internal", format!("get tournament: {e}")),
    };
    if tournament.status != TOURNAMENT_STATUS_OPEN {
        return fail("FailedPrecondition", "tournament not open".into());
    }

    let (_, team_size) = parse_tournament_format(&tournament.format);
    if req.discord_user_ids.len() != team_size {
        return fail("InvalidArgument", format!("expected {team_size} players"));
    }

    let players =
        match load_players(&ctx, &mut conn, game, &team.guild_id, &req.discord_user_ids).await {
            Ok(p) => p,
            Err(msg) => return fail("InvalidArgument", msg),
        };
    let now = now_ms();
    let roster: Vec<NewTournamentTeamRoster> = players
        .iter()
        .enumerate()
        .map(|(slot, p)| NewTournamentTeamRoster {
            game,
            tournament_id: req.tournament_id,
            team_id: req.team_id,
            discord_user_id: &p.member.discord_user_id,
            player_id: p.member.player_id,
            slot: slot as i32,
            username: &p.member.username,
            platform: &p.member.platform,
            balance_rating: p.rated.cpr,
            seed_rank_points: p.seeds.rank_points,
            seed_kd_ratio: p.seeds.kd_ratio,
            seed_kost: p.seeds.kost,
            seed_kpr: p.seeds.kpr,
            seed_headshot_percentage: p.seeds.headshot_percentage,
            seed_score: p.seeds.score,
            created_at: now,
            updated_at: now,
        })
        .collect();

    let _ = TournamentRosterRepo::replace_for_team(&mut conn, req.team_id, roster)
        .await
        .map_err(|e| format!("replace roster: {e}"));

    encode_ok(
        &TeamResponse {
            success: true,
            team: Some(ProtoTournamentTeam {
                id: team.id,
                tournament_id: team.tournament_id,
                guild_id: team.guild_id,
                channel_id: team.channel_id,
                captain_discord_user_id: team.captain_discord_user_id,
                team_name: team.team_name,
                status: team.status,
                seed_number: team.seed_number.unwrap_or(0),
                stack_balance_average: team.stack_balance_average,
                roster: Vec::new(),
            }),
            error: None,
        },
        enc,
    )
}

pub async fn unregister_team_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: UnregisterTeamRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &TeamResponse {
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
        Err(e) => return fail("Internal", format!("pool: {e}")),
    };

    let team = match TournamentTeamRepo::get(&mut conn, game, req.team_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "team not found".into()),
        Err(e) => return fail("Internal", format!("get: {e}")),
    };
    if team.captain_discord_user_id != req.captain_discord_user_id {
        return fail("PermissionDenied", "only captain can unregister".into());
    }

    let tournament = match TournamentRepo::get(&mut conn, game, req.tournament_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "tournament not found".into()),
        Err(e) => return fail("Internal", format!("get tournament: {e}")),
    };
    if tournament.status != TOURNAMENT_STATUS_OPEN {
        return fail("FailedPrecondition", "tournament not open".into());
    }

    match TournamentTeamRepo::withdraw(&mut conn, game, req.team_id).await {
        Ok(Some(t)) => encode_ok(
            &TeamResponse {
                success: true,
                team: Some(ProtoTournamentTeam {
                    id: t.id,
                    tournament_id: t.tournament_id,
                    guild_id: t.guild_id,
                    channel_id: t.channel_id,
                    captain_discord_user_id: t.captain_discord_user_id,
                    team_name: t.team_name,
                    status: t.status,
                    seed_number: t.seed_number.unwrap_or(0),
                    stack_balance_average: t.stack_balance_average,
                    roster: Vec::new(),
                }),
                error: None,
            },
            enc,
        ),
        Ok(None) => fail("NotFound", "team not found".into()),
        Err(e) => fail("Internal", format!("withdraw: {e}")),
    }
}

pub async fn start_tournament_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: StartTournamentRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &TournamentResponse {
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

    let min_teams = if req.min_teams <= 0 { 2 } else { req.min_teams };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => return fail("Internal", format!("pool: {e}")),
    };

    let tournament = match TournamentRepo::get(&mut conn, game, req.tournament_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "tournament not found".into()),
        Err(e) => return fail("Internal", format!("get: {e}")),
    };
    if tournament.status != TOURNAMENT_STATUS_OPEN {
        return fail("FailedPrecondition", "tournament not open".into());
    }

    let mut teams = TournamentTeamRepo::list_for_tournament(&mut conn, req.tournament_id)
        .await
        .unwrap_or_default();
    if teams.len() < min_teams as usize {
        return fail(
            "FailedPrecondition",
            format!("need at least {min_teams} teams, have {}", teams.len()),
        );
    }

    if let Err(e) = seed_and_activate_teams(&mut conn, &mut teams).await {
        return fail("Internal", format!("seed: {e}"));
    }

    let (bracket_type, _) = parse_tournament_format(&tournament.format);
    let drafts = if bracket_type == "double_elimination" {
        generate_double_elimination(&teams)
    } else {
        generate_single_elimination(&teams)
    };

    if let Err(e) = persist_bracket(&mut conn, game, req.tournament_id, drafts).await {
        return fail("Internal", format!("bracket: {e}"));
    }

    let now = now_ms();
    let updated = match TournamentRepo::update_status(
        &mut conn,
        game,
        req.tournament_id,
        TOURNAMENT_STATUS_IN_PROGRESS,
        Some(now),
        None,
        None,
    )
    .await
    {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "tournament not found".into()),
        Err(e) => return fail("Internal", format!("update: {e}")),
    };

    let proto = match build_tournament_proto(&ctx, &mut conn, game, &updated).await {
        Ok(p) => p,
        Err(msg) => return fail("Internal", msg),
    };

    encode_ok(
        &TournamentResponse {
            success: true,
            tournament: Some(proto),
            error: None,
        },
        enc,
    )
}

pub async fn report_bracket_result_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: ReportBracketResultRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &BracketMatchResponse {
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
        Err(e) => return fail("Internal", format!("pool: {e}")),
    };

    let bm = match BracketMatchRepo::get(&mut conn, game, req.bracket_match_id).await {
        Ok(Some(b)) => b,
        Ok(None) => return fail("NotFound", "bracket match not found".into()),
        Err(e) => return fail("Internal", format!("get: {e}")),
    };

    let loser_id = if Some(req.winner_team_id) == bm.team_a_id {
        bm.team_b_id
    } else {
        bm.team_a_id
    };
    let loser_id = loser_id.unwrap_or(0);

    let updated_bm = match BracketMatchRepo::update_result(
        &mut conn,
        req.bracket_match_id,
        req.winner_team_id,
        loser_id,
    )
    .await
    {
        Ok(Some(b)) => b,
        Ok(None) => return fail("NotFound", "bracket match not found".into()),
        Err(e) => return fail("Internal", format!("update: {e}")),
    };

    if loser_id > 0 {
        let _ = TournamentTeamRepo::eliminate(&mut conn, loser_id).await;
    }

    if let Some(next_id) = updated_bm.winner_to_match_id {
        let slot = updated_bm.winner_to_slot.as_deref().unwrap_or("a");
        let _ = BracketMatchRepo::set_team_slot(&mut conn, next_id, slot, req.winner_team_id).await;
        let _ = BracketMatchRepo::mark_ready_when_both_teams(&mut conn, next_id).await;
    }
    if let Some(next_id) = updated_bm.loser_to_match_id.filter(|_| loser_id > 0) {
        let slot = updated_bm.loser_to_slot.as_deref().unwrap_or("b");
        let _ = BracketMatchRepo::set_team_slot(&mut conn, next_id, slot, loser_id).await;
        let _ = BracketMatchRepo::mark_ready_when_both_teams(&mut conn, next_id).await;
    }

    let tournament = match TournamentRepo::get(&mut conn, game, bm.tournament_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "tournament not found".into()),
        Err(e) => return fail("Internal", format!("get tournament: {e}")),
    };

    if updated_bm.winner_to_match_id.is_none() && updated_bm.bracket == "grand_final" {
        let now = now_ms();
        let _ = TournamentRepo::update_status(
            &mut conn,
            game,
            bm.tournament_id,
            TOURNAMENT_STATUS_COMPLETED,
            tournament.started_at,
            Some(now),
            Some(req.winner_team_id),
        )
        .await;
    } else if updated_bm.winner_to_match_id.is_none() && updated_bm.bracket == "winners" {
        let brackets = BracketMatchRepo::list_for_tournament(&mut conn, bm.tournament_id)
            .await
            .unwrap_or_default();
        let max_round = brackets
            .iter()
            .filter(|b| b.bracket == "winners")
            .map(|b| b.round_number)
            .max();
        if Some(updated_bm.round_number) == max_round {
            let now = now_ms();
            let _ = TournamentRepo::update_status(
                &mut conn,
                game,
                bm.tournament_id,
                TOURNAMENT_STATUS_COMPLETED,
                tournament.started_at,
                Some(now),
                Some(req.winner_team_id),
            )
            .await;
        }
    }

    let tournament = TournamentRepo::get(&mut conn, game, bm.tournament_id)
        .await
        .ok()
        .flatten();
    let proto_tournament = if let Some(ref t) = tournament {
        build_tournament_proto(&ctx, &mut conn, game, t).await.ok()
    } else {
        None
    };

    encode_ok(
        &BracketMatchResponse {
            success: true,
            bracket_match: Some(ProtoBracketMatch {
                id: updated_bm.id,
                tournament_id: updated_bm.tournament_id,
                bracket: updated_bm.bracket,
                round_number: updated_bm.round_number,
                match_number: updated_bm.match_number,
                status: updated_bm.status,
                team_a_id: updated_bm.team_a_id.unwrap_or(0),
                team_b_id: updated_bm.team_b_id.unwrap_or(0),
                winner_team_id: updated_bm.winner_team_id.unwrap_or(0),
                loser_team_id: updated_bm.loser_team_id.unwrap_or(0),
                winner_to_match_id: updated_bm.winner_to_match_id.unwrap_or(0),
                winner_to_slot: updated_bm.winner_to_slot.unwrap_or_default(),
                loser_to_match_id: updated_bm.loser_to_match_id.unwrap_or(0),
                loser_to_slot: updated_bm.loser_to_slot.unwrap_or_default(),
                custom_match_id: updated_bm.custom_match_id.unwrap_or(0),
            }),
            tournament: proto_tournament,
            error: None,
        },
        enc,
    )
}

pub async fn cancel_tournament_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: CancelTournamentRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let fail = |code: &str, msg: String| {
        encode_ok(
            &TournamentResponse {
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
        Err(e) => return fail("Internal", format!("pool: {e}")),
    };

    let tournament = match TournamentRepo::get(&mut conn, game, req.tournament_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "tournament not found".into()),
        Err(e) => return fail("Internal", format!("get: {e}")),
    };
    if tournament.created_by_discord_user_id != req.cancelled_by_discord_user_id {
        return fail("PermissionDenied", "only creator can cancel".into());
    }

    let updated = match TournamentRepo::update_status(
        &mut conn,
        game,
        req.tournament_id,
        TOURNAMENT_STATUS_CANCELLED,
        tournament.started_at,
        None,
        None,
    )
    .await
    {
        Ok(Some(t)) => t,
        Ok(None) => return fail("NotFound", "tournament not found".into()),
        Err(e) => return fail("Internal", format!("update: {e}")),
    };

    let proto = match build_tournament_proto(&ctx, &mut conn, game, &updated).await {
        Ok(p) => p,
        Err(msg) => return fail("Internal", msg),
    };

    encode_ok(
        &TournamentResponse {
            success: true,
            tournament: Some(proto),
            error: None,
        },
        enc,
    )
}
