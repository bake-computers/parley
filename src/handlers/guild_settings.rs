//! GuildSettingsService — per-guild, per-game configuration surfaces.
//!
//! Every `Get*` returns well-defined defaults on miss instead of `NotFound`.
//! Every `Upsert*` is idempotent (INSERT … ON CONFLICT DO UPDATE).

use axum::{body::Bytes, extract::State, http::HeaderMap, response::Response};

use crate::connect::{decode_body, detect_encoding, encode_ok};
use crate::context::AppContext;
use crate::db::Game as DbGame;
use crate::db::models::{
    NewGuildMatchQuota, NewGuildMatchmakingRules, NewGuildNotificationSettings, NewGuildSettings,
};
use crate::db::repos::{
    GuildMatchQuotaRepo, GuildMatchmakingRulesRepo, GuildNotificationSettingsRepo,
    GuildSettingsRepo, now_ms,
};
use crate::proto::common::v1::{Error as ProtoError, Game as ProtoGame};
use crate::proto::guild::v1::{
    GetGuildSettingsRequest, GetMatchQuotasRequest, GetMatchmakingRulesRequest,
    GetNotificationSettingsRequest, GuildMatchQuota as ProtoGuildMatchQuota,
    GuildMatchQuotasResponse, GuildMatchmakingRules as ProtoGuildMatchmakingRules,
    GuildMatchmakingRulesResponse, GuildNotificationSettings as ProtoGuildNotificationSettings,
    GuildNotificationSettingsResponse, GuildSettings as ProtoGuildSettings, GuildSettingsResponse,
    UpsertGuildSettingsRequest, UpsertMatchQuotasRequest, UpsertMatchmakingRulesRequest,
    UpsertNotificationSettingsRequest,
};

fn proto_game_to_db(v: i32) -> Option<DbGame> {
    match ProtoGame::try_from(v).unwrap_or(ProtoGame::Unspecified) {
        ProtoGame::R6 => Some(DbGame::R6),
        ProtoGame::BrawlStars => Some(DbGame::BrawlStars),
        ProtoGame::Unspecified => None,
    }
}

fn db_game_to_proto(g: DbGame) -> i32 {
    match g {
        DbGame::R6 => ProtoGame::R6 as i32,
        DbGame::BrawlStars => ProtoGame::BrawlStars as i32,
    }
}

fn err(code: &str, msg: impl Into<String>) -> ProtoError {
    ProtoError {
        code: code.to_string(),
        message: msg.into(),
    }
}

fn need_game(game: i32) -> Result<DbGame, ProtoError> {
    proto_game_to_db(game).ok_or_else(|| err("InvalidArgument", "game must be R6 or BrawlStars"))
}

// ======================================================================
// GuildSettings
// ======================================================================

pub async fn get_guild_settings_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetGuildSettingsRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "guild.get_settings",
            "FailedPrecondition",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/GetGuildSettings".into()),
        );
        return encode_ok(
            &GuildSettingsResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let game = match need_game(req.game) {
        Ok(g) => g,
        Err(e) => {
            ctx.axiom.log_error(
                "guild.get_settings",
                &e.code,
                &e.message,
                Some("/parley.guild.v1.GuildSettingsService/GetGuildSettings".into()),
            );
            return encode_ok(
                &GuildSettingsResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "guild.get_settings",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/GetGuildSettings".into()),
            );
            return encode_ok(
                &GuildSettingsResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let row = GuildSettingsRepo::get(&mut conn, &req.guild_id, game).await;
    let settings = match row {
        Ok(Some(s)) => ProtoGuildSettings {
            guild_id: s.guild_id,
            game: db_game_to_proto(s.game),
            default_team_format: s.default_team_format.unwrap_or_default(),
            auto_balance: s.auto_balance,
            cross_guild_matchmaking: s.cross_guild_matchmaking,
            updated_at_ms: s.updated_at,
            updated_by_discord_user_id: s.updated_by_discord_user_id,
        },
        Ok(None) => ProtoGuildSettings {
            guild_id: req.guild_id.clone(),
            game: db_game_to_proto(game),
            default_team_format: String::new(),
            auto_balance: true,
            cross_guild_matchmaking: true,
            updated_at_ms: 0,
            updated_by_discord_user_id: String::new(),
        },
        Err(e) => {
            let msg = format!("get: {e}");
            ctx.axiom.log_error(
                "guild.get_settings",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/GetGuildSettings".into()),
            );
            return encode_ok(
                &GuildSettingsResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    encode_ok(
        &GuildSettingsResponse {
            success: true,
            settings: Some(settings),
            error: None,
        },
        enc,
    )
}

pub async fn upsert_guild_settings_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: UpsertGuildSettingsRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "guild.upsert_settings",
            "FailedPrecondition",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/UpsertGuildSettings".into()),
        );
        return encode_ok(
            &GuildSettingsResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let Some(s) = req.settings else {
        let msg = "settings payload required".to_string();
        ctx.axiom.log_error(
            "guild.upsert_settings",
            "InvalidArgument",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/UpsertGuildSettings".into()),
        );
        return encode_ok(
            &GuildSettingsResponse {
                success: false,
                error: Some(err("InvalidArgument", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let game = match need_game(s.game) {
        Ok(g) => g,
        Err(e) => {
            ctx.axiom.log_error(
                "guild.upsert_settings",
                &e.code,
                &e.message,
                Some("/parley.guild.v1.GuildSettingsService/UpsertGuildSettings".into()),
            );
            return encode_ok(
                &GuildSettingsResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "guild.upsert_settings",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/UpsertGuildSettings".into()),
            );
            return encode_ok(
                &GuildSettingsResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let new_row = NewGuildSettings {
        guild_id: &s.guild_id,
        game,
        default_team_format: if s.default_team_format.is_empty() {
            None
        } else {
            Some(&s.default_team_format)
        },
        auto_balance: s.auto_balance,
        cross_guild_matchmaking: s.cross_guild_matchmaking,
        updated_at: now_ms(),
        updated_by_discord_user_id: &s.updated_by_discord_user_id,
    };
    let saved = match GuildSettingsRepo::upsert(&mut conn, new_row).await {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("upsert: {e}");
            ctx.axiom.log_error(
                "guild.upsert_settings",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/UpsertGuildSettings".into()),
            );
            return encode_ok(
                &GuildSettingsResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    encode_ok(
        &GuildSettingsResponse {
            success: true,
            settings: Some(ProtoGuildSettings {
                guild_id: saved.guild_id,
                game: db_game_to_proto(saved.game),
                default_team_format: saved.default_team_format.unwrap_or_default(),
                auto_balance: saved.auto_balance,
                cross_guild_matchmaking: saved.cross_guild_matchmaking,
                updated_at_ms: saved.updated_at,
                updated_by_discord_user_id: saved.updated_by_discord_user_id,
            }),
            error: None,
        },
        enc,
    )
}

// ======================================================================
// GuildMatchmakingRules
// ======================================================================

pub async fn get_matchmaking_rules_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetMatchmakingRulesRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "guild.get_matchmaking_rules",
            "FailedPrecondition",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/GetMatchmakingRules".into()),
        );
        return encode_ok(
            &GuildMatchmakingRulesResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let game = match need_game(req.game) {
        Ok(g) => g,
        Err(e) => {
            ctx.axiom.log_error(
                "guild.get_matchmaking_rules",
                &e.code,
                &e.message,
                Some("/parley.guild.v1.GuildSettingsService/GetMatchmakingRules".into()),
            );
            return encode_ok(
                &GuildMatchmakingRulesResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "guild.get_matchmaking_rules",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/GetMatchmakingRules".into()),
            );
            return encode_ok(
                &GuildMatchmakingRulesResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let rules = match GuildMatchmakingRulesRepo::get(&mut conn, &req.guild_id, game).await {
        Ok(Some(r)) => ProtoGuildMatchmakingRules {
            guild_id: r.guild_id,
            game: db_game_to_proto(r.game),
            min_elo: r.min_elo.unwrap_or(0),
            max_elo: r.max_elo.unwrap_or(0),
            platforms: r.platforms.unwrap_or_default(),
            require_verified: r.require_verified,
            max_elo_gap: r.max_elo_gap,
            updated_at_ms: r.updated_at,
        },
        Ok(None) => ProtoGuildMatchmakingRules {
            guild_id: req.guild_id,
            game: db_game_to_proto(game),
            min_elo: 0,
            max_elo: 0,
            platforms: Vec::new(),
            require_verified: false,
            max_elo_gap: 500,
            updated_at_ms: 0,
        },
        Err(e) => {
            let msg = format!("get: {e}");
            ctx.axiom.log_error(
                "guild.get_matchmaking_rules",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/GetMatchmakingRules".into()),
            );
            return encode_ok(
                &GuildMatchmakingRulesResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    encode_ok(
        &GuildMatchmakingRulesResponse {
            success: true,
            rules: Some(rules),
            error: None,
        },
        enc,
    )
}

pub async fn upsert_matchmaking_rules_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: UpsertMatchmakingRulesRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "guild.upsert_matchmaking_rules",
            "FailedPrecondition",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/UpsertMatchmakingRules".into()),
        );
        return encode_ok(
            &GuildMatchmakingRulesResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let Some(r) = req.rules else {
        let msg = "rules payload required".to_string();
        ctx.axiom.log_error(
            "guild.upsert_matchmaking_rules",
            "InvalidArgument",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/UpsertMatchmakingRules".into()),
        );
        return encode_ok(
            &GuildMatchmakingRulesResponse {
                success: false,
                error: Some(err("InvalidArgument", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let game = match need_game(r.game) {
        Ok(g) => g,
        Err(e) => {
            ctx.axiom.log_error(
                "guild.upsert_matchmaking_rules",
                &e.code,
                &e.message,
                Some("/parley.guild.v1.GuildSettingsService/UpsertMatchmakingRules".into()),
            );
            return encode_ok(
                &GuildMatchmakingRulesResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "guild.upsert_matchmaking_rules",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/UpsertMatchmakingRules".into()),
            );
            return encode_ok(
                &GuildMatchmakingRulesResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let new_row = NewGuildMatchmakingRules {
        guild_id: &r.guild_id,
        game,
        min_elo: if r.min_elo == 0 {
            None
        } else {
            Some(r.min_elo)
        },
        max_elo: if r.max_elo == 0 {
            None
        } else {
            Some(r.max_elo)
        },
        platforms: if r.platforms.is_empty() {
            None
        } else {
            Some(r.platforms.clone())
        },
        require_verified: r.require_verified,
        max_elo_gap: if r.max_elo_gap == 0 {
            500
        } else {
            r.max_elo_gap
        },
        updated_at: now_ms(),
    };
    let saved = match GuildMatchmakingRulesRepo::upsert(&mut conn, new_row).await {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("upsert: {e}");
            ctx.axiom.log_error(
                "guild.upsert_matchmaking_rules",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/UpsertMatchmakingRules".into()),
            );
            return encode_ok(
                &GuildMatchmakingRulesResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    encode_ok(
        &GuildMatchmakingRulesResponse {
            success: true,
            rules: Some(ProtoGuildMatchmakingRules {
                guild_id: saved.guild_id,
                game: db_game_to_proto(saved.game),
                min_elo: saved.min_elo.unwrap_or(0),
                max_elo: saved.max_elo.unwrap_or(0),
                platforms: saved.platforms.unwrap_or_default(),
                require_verified: saved.require_verified,
                max_elo_gap: saved.max_elo_gap,
                updated_at_ms: saved.updated_at,
            }),
            error: None,
        },
        enc,
    )
}

pub async fn get_notification_settings_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetNotificationSettingsRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "guild.get_notification_settings",
            "FailedPrecondition",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/GetNotificationSettings".into()),
        );
        return encode_ok(
            &GuildNotificationSettingsResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let game = match need_game(req.game) {
        Ok(g) => g,
        Err(e) => {
            ctx.axiom.log_error(
                "guild.get_notification_settings",
                &e.code,
                &e.message,
                Some("/parley.guild.v1.GuildSettingsService/GetNotificationSettings".into()),
            );
            return encode_ok(
                &GuildNotificationSettingsResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "guild.get_notification_settings",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/GetNotificationSettings".into()),
            );
            return encode_ok(
                &GuildNotificationSettingsResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let settings = match GuildNotificationSettingsRepo::get(&mut conn, &req.guild_id, game).await {
        Ok(Some(r)) => ProtoGuildNotificationSettings {
            guild_id: r.guild_id,
            game: db_game_to_proto(r.game),
            match_results_channel: r.match_results_channel.unwrap_or_default(),
            tournament_announcements_channel: r
                .tournament_announcements_channel
                .unwrap_or_default(),
            leaderboard_updates_enabled: r.leaderboard_updates_enabled,
            updated_at_ms: r.updated_at,
        },
        Ok(None) => ProtoGuildNotificationSettings {
            guild_id: req.guild_id,
            game: db_game_to_proto(game),
            match_results_channel: String::new(),
            tournament_announcements_channel: String::new(),
            leaderboard_updates_enabled: false,
            updated_at_ms: 0,
        },
        Err(e) => {
            let msg = format!("get: {e}");
            ctx.axiom.log_error(
                "guild.get_notification_settings",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/GetNotificationSettings".into()),
            );
            return encode_ok(
                &GuildNotificationSettingsResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    encode_ok(
        &GuildNotificationSettingsResponse {
            success: true,
            settings: Some(settings),
            error: None,
        },
        enc,
    )
}

pub async fn upsert_notification_settings_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: UpsertNotificationSettingsRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "guild.upsert_notification_settings",
            "FailedPrecondition",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/UpsertNotificationSettings".into()),
        );
        return encode_ok(
            &GuildNotificationSettingsResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let Some(s) = req.settings else {
        let msg = "settings payload required".to_string();
        ctx.axiom.log_error(
            "guild.upsert_notification_settings",
            "InvalidArgument",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/UpsertNotificationSettings".into()),
        );
        return encode_ok(
            &GuildNotificationSettingsResponse {
                success: false,
                error: Some(err("InvalidArgument", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let game = match need_game(s.game) {
        Ok(g) => g,
        Err(e) => {
            ctx.axiom.log_error(
                "guild.upsert_notification_settings",
                &e.code,
                &e.message,
                Some("/parley.guild.v1.GuildSettingsService/UpsertNotificationSettings".into()),
            );
            return encode_ok(
                &GuildNotificationSettingsResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "guild.upsert_notification_settings",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/UpsertNotificationSettings".into()),
            );
            return encode_ok(
                &GuildNotificationSettingsResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let new_row = NewGuildNotificationSettings {
        guild_id: &s.guild_id,
        game,
        match_results_channel: if s.match_results_channel.is_empty() {
            None
        } else {
            Some(&s.match_results_channel)
        },
        tournament_announcements_channel: if s.tournament_announcements_channel.is_empty() {
            None
        } else {
            Some(&s.tournament_announcements_channel)
        },
        leaderboard_updates_enabled: s.leaderboard_updates_enabled,
        updated_at: now_ms(),
    };
    let saved = match GuildNotificationSettingsRepo::upsert(&mut conn, new_row).await {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("upsert: {e}");
            ctx.axiom.log_error(
                "guild.upsert_notification_settings",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/UpsertNotificationSettings".into()),
            );
            return encode_ok(
                &GuildNotificationSettingsResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    encode_ok(
        &GuildNotificationSettingsResponse {
            success: true,
            settings: Some(ProtoGuildNotificationSettings {
                guild_id: saved.guild_id,
                game: db_game_to_proto(saved.game),
                match_results_channel: saved.match_results_channel.unwrap_or_default(),
                tournament_announcements_channel: saved
                    .tournament_announcements_channel
                    .unwrap_or_default(),
                leaderboard_updates_enabled: saved.leaderboard_updates_enabled,
                updated_at_ms: saved.updated_at,
            }),
            error: None,
        },
        enc,
    )
}

pub async fn get_match_quotas_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetMatchQuotasRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "guild.get_match_quotas",
            "FailedPrecondition",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/GetMatchQuotas".into()),
        );
        return encode_ok(
            &GuildMatchQuotasResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let game = match need_game(req.game) {
        Ok(g) => g,
        Err(e) => {
            ctx.axiom.log_error(
                "guild.get_match_quotas",
                &e.code,
                &e.message,
                Some("/parley.guild.v1.GuildSettingsService/GetMatchQuotas".into()),
            );
            return encode_ok(
                &GuildMatchQuotasResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "guild.get_match_quotas",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/GetMatchQuotas".into()),
            );
            return encode_ok(
                &GuildMatchQuotasResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let quota = match GuildMatchQuotaRepo::get(&mut conn, &req.guild_id, game).await {
        Ok(Some(q)) => ProtoGuildMatchQuota {
            guild_id: q.guild_id,
            game: db_game_to_proto(q.game),
            daily_match_limit: q.daily_match_limit,
            updated_by_discord_user_id: q.updated_by_discord_user_id,
            updated_at_ms: q.updated_at,
        },
        Ok(None) => ProtoGuildMatchQuota {
            guild_id: req.guild_id,
            game: db_game_to_proto(game),
            daily_match_limit: 0,
            updated_by_discord_user_id: String::new(),
            updated_at_ms: 0,
        },
        Err(e) => {
            let msg = format!("get: {e}");
            ctx.axiom.log_error(
                "guild.get_match_quotas",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/GetMatchQuotas".into()),
            );
            return encode_ok(
                &GuildMatchQuotasResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    encode_ok(
        &GuildMatchQuotasResponse {
            success: true,
            quota: Some(quota),
            error: None,
        },
        enc,
    )
}

pub async fn upsert_match_quotas_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: UpsertMatchQuotasRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "guild.upsert_match_quotas",
            "FailedPrecondition",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/UpsertMatchQuotas".into()),
        );
        return encode_ok(
            &GuildMatchQuotasResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let Some(q) = req.quota else {
        let msg = "quota payload required".to_string();
        ctx.axiom.log_error(
            "guild.upsert_match_quotas",
            "InvalidArgument",
            &msg,
            Some("/parley.guild.v1.GuildSettingsService/UpsertMatchQuotas".into()),
        );
        return encode_ok(
            &GuildMatchQuotasResponse {
                success: false,
                error: Some(err("InvalidArgument", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let game = match need_game(q.game) {
        Ok(g) => g,
        Err(e) => {
            ctx.axiom.log_error(
                "guild.upsert_match_quotas",
                &e.code,
                &e.message,
                Some("/parley.guild.v1.GuildSettingsService/UpsertMatchQuotas".into()),
            );
            return encode_ok(
                &GuildMatchQuotasResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "guild.upsert_match_quotas",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/UpsertMatchQuotas".into()),
            );
            return encode_ok(
                &GuildMatchQuotasResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    let new_row = NewGuildMatchQuota {
        game,
        guild_id: &q.guild_id,
        daily_match_limit: q.daily_match_limit,
        updated_by_discord_user_id: &q.updated_by_discord_user_id,
        created_at: now_ms(),
        updated_at: now_ms(),
    };
    let saved = match GuildMatchQuotaRepo::upsert(&mut conn, new_row).await {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("upsert: {e}");
            ctx.axiom.log_error(
                "guild.upsert_match_quotas",
                "Internal",
                &msg,
                Some("/parley.guild.v1.GuildSettingsService/UpsertMatchQuotas".into()),
            );
            return encode_ok(
                &GuildMatchQuotasResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };
    encode_ok(
        &GuildMatchQuotasResponse {
            success: true,
            quota: Some(ProtoGuildMatchQuota {
                guild_id: saved.guild_id,
                game: db_game_to_proto(saved.game),
                daily_match_limit: saved.daily_match_limit,
                updated_by_discord_user_id: saved.updated_by_discord_user_id,
                updated_at_ms: saved.updated_at,
            }),
            error: None,
        },
        enc,
    )
}
