//! IdentityService — Discord ↔ game-account linking backed by Diesel repos.
//!
//! All methods are idempotent. Cross-game isolation: one Discord user can
//! have distinct R6 and Brawl Stars links simultaneously because every unique
//! index is rescoped by `(game, …)`.

use axum::{body::Bytes, extract::State, http::HeaderMap, response::Response};

use crate::connect::{decode_body, detect_encoding, encode_ok};
use crate::context::AppContext;
use crate::db::Game as DbGame;
use crate::db::models::Player;
use crate::db::repos::{
    AccountDeletionCooldownRepo, DiscordIdentityRepo, GuildMembershipRepo, PlayerRepo,
};
use crate::proto::common::v1::{Error as ProtoError, Game as ProtoGame};
use crate::proto::identity::v1::{
    LinkAccountRequest, LinkAccountResponse, LinkedIdentity, LookupByDiscordRequest,
    LookupByDiscordResponse, LookupByUsernameRequest, LookupByUsernameResponse,
    UnlinkAccountRequest, UnlinkAccountResponse,
};

fn proto_game_to_db(v: i32) -> Option<DbGame> {
    match ProtoGame::try_from(v).unwrap_or(ProtoGame::Unspecified) {
        ProtoGame::R6 => Some(DbGame::R6),
        ProtoGame::Unspecified => None,
        _ => None,
    }
}

fn db_game_to_proto(g: DbGame) -> i32 {
    match g {
        DbGame::R6 => ProtoGame::R6 as i32,
    }
}

fn err(code: &str, msg: impl Into<String>) -> ProtoError {
    ProtoError {
        code: code.to_string(),
        message: msg.into(),
    }
}

pub async fn link_account_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: LinkAccountRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "identity.link_account",
            "FailedPrecondition",
            &msg,
            Some("/parley.identity.v1.IdentityService/LinkAccount".into()),
        );
        return encode_ok(
            &LinkAccountResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let Some(game) = proto_game_to_db(req.game) else {
        let msg = "game must be R6".to_string();
        ctx.axiom.log_error(
            "identity.link_account",
            "InvalidArgument",
            &msg,
            Some("/parley.identity.v1.IdentityService/LinkAccount".into()),
        );
        return encode_ok(
            &LinkAccountResponse {
                success: false,
                error: Some(err("InvalidArgument", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    if req.discord_user_id.trim().is_empty()
        || req.username.trim().is_empty()
        || req.platform.trim().is_empty()
    {
        let msg = "discord_user_id, username and platform are required".to_string();
        ctx.axiom.log_error(
            "identity.link_account",
            "InvalidArgument",
            &msg,
            Some("/parley.identity.v1.IdentityService/LinkAccount".into()),
        );
        return encode_ok(
            &LinkAccountResponse {
                success: false,
                error: Some(err("InvalidArgument", msg)),
                ..Default::default()
            },
            enc,
        );
    }

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "identity.link_account",
                "Internal",
                &msg,
                Some("/parley.identity.v1.IdentityService/LinkAccount".into()),
            );
            return encode_ok(
                &LinkAccountResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    if let Some(secret) = std::env::var("ACCOUNT_DELETION_HMAC_SECRET")
        .ok()
        .filter(|s| !s.is_empty())
    {
        match AccountDeletionCooldownRepo::is_blocked(&mut conn, &req.discord_user_id, &secret)
            .await
        {
            Ok(Some(until)) => {
                let msg = format!("account deletion cooldown active until {until} ms since epoch");
                ctx.axiom.log_error(
                    "identity.link_account",
                    "FailedPrecondition",
                    &msg,
                    Some("/parley.identity.v1.IdentityService/LinkAccount".into()),
                );
                return encode_ok(
                    &LinkAccountResponse {
                        success: false,
                        error: Some(err("FailedPrecondition", msg)),
                        ..Default::default()
                    },
                    enc,
                );
            }
            Ok(None) => {}
            Err(e) => {
                tracing::warn!(error = %e, "deletion cooldown check failed (non-fatal)");
            }
        }
    }

    let player = match PlayerRepo::upsert_by_identity(
        &mut conn,
        game,
        &req.username,
        &req.platform,
        None,
        None,
    )
    .await
    {
        Ok(p) => p,
        Err(e) => {
            let msg = format!("upsert player: {e}");
            ctx.axiom.log_error(
                "identity.link_account",
                "Internal",
                &msg,
                Some("/parley.identity.v1.IdentityService/LinkAccount".into()),
            );
            return encode_ok(
                &LinkAccountResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    if let Err(e) =
        DiscordIdentityRepo::link(&mut conn, game, &req.discord_user_id, player.id).await
    {
        let msg = format!("link discord identity: {e}");
        ctx.axiom.log_error(
            "identity.link_account",
            "Internal",
            &msg,
            Some("/parley.identity.v1.IdentityService/LinkAccount".into()),
        );
        return encode_ok(
            &LinkAccountResponse {
                success: false,
                error: Some(err("Internal", msg)),
                ..Default::default()
            },
            enc,
        );
    }

    if !req.guild_id.trim().is_empty() {
        match GuildMembershipRepo::upsert(
            &mut conn,
            game,
            &req.guild_id,
            &req.discord_user_id,
            player.id,
        )
        .await
        {
            Ok(_) => {
                if let Some(cache) = &ctx.guild_cache {
                    cache.invalidate_guild(game, &req.guild_id).await;
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "guild membership upsert failed (non-fatal)");
            }
        }
    }

    encode_ok(
        &LinkAccountResponse {
            success: true,
            player_id: player.id,
            username_normalized: player.username_normalized,
            error: None,
        },
        enc,
    )
}

pub async fn unlink_account_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: UnlinkAccountRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "identity.unlink_account",
            "FailedPrecondition",
            &msg,
            Some("/parley.identity.v1.IdentityService/UnlinkAccount".into()),
        );
        return encode_ok(
            &UnlinkAccountResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let Some(game) = proto_game_to_db(req.game) else {
        let msg = "game must be R6".to_string();
        ctx.axiom.log_error(
            "identity.unlink_account",
            "InvalidArgument",
            &msg,
            Some("/parley.identity.v1.IdentityService/UnlinkAccount".into()),
        );
        return encode_ok(
            &UnlinkAccountResponse {
                success: false,
                error: Some(err("InvalidArgument", msg)),
                ..Default::default()
            },
            enc,
        );
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "identity.unlink_account",
                "Internal",
                &msg,
                Some("/parley.identity.v1.IdentityService/UnlinkAccount".into()),
            );
            return encode_ok(
                &UnlinkAccountResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let removed = match DiscordIdentityRepo::unlink(&mut conn, game, &req.discord_user_id).await {
        Ok(n) => n,
        Err(e) => {
            let msg = format!("unlink: {e}");
            ctx.axiom.log_error(
                "identity.unlink_account",
                "Internal",
                &msg,
                Some("/parley.identity.v1.IdentityService/UnlinkAccount".into()),
            );
            return encode_ok(
                &UnlinkAccountResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    encode_ok(
        &UnlinkAccountResponse {
            success: true,
            removed: removed as i32,
            error: None,
        },
        enc,
    )
}

pub async fn lookup_by_discord_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: LookupByDiscordRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "identity.lookup_by_discord",
            "FailedPrecondition",
            &msg,
            Some("/parley.identity.v1.IdentityService/LookupByDiscord".into()),
        );
        return encode_ok(
            &LookupByDiscordResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    // game == Unspecified means "return identities for every game".
    let game_filter = proto_game_to_db(req.game);

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "identity.lookup_by_discord",
                "Internal",
                &msg,
                Some("/parley.identity.v1.IdentityService/LookupByDiscord".into()),
            );
            return encode_ok(
                &LookupByDiscordResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let idents =
        match DiscordIdentityRepo::find_by_discord(&mut conn, game_filter, &req.discord_user_id)
            .await
        {
            Ok(v) => v,
            Err(e) => {
                let msg = format!("lookup: {e}");
                ctx.axiom.log_error(
                    "identity.lookup_by_discord",
                    "Internal",
                    &msg,
                    Some("/parley.identity.v1.IdentityService/LookupByDiscord".into()),
                );
                return encode_ok(
                    &LookupByDiscordResponse {
                        success: false,
                        error: Some(err("Internal", msg)),
                        ..Default::default()
                    },
                    enc,
                );
            }
        };

    let mut out = Vec::with_capacity(idents.len());
    for id in &idents {
        let Ok(Some(player)) = PlayerRepo::find(&mut conn, id.player_id).await else {
            continue;
        };
        out.push(player_to_linked(&id.discord_user_id, player, id.game));
    }
    encode_ok(
        &LookupByDiscordResponse {
            success: true,
            identities: out,
            error: None,
        },
        enc,
    )
}

pub async fn lookup_by_username_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: LookupByUsernameRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(pool) = ctx.pool.clone() else {
        let msg = "DATABASE_URL not configured".to_string();
        ctx.axiom.log_error(
            "identity.lookup_by_username",
            "FailedPrecondition",
            &msg,
            Some("/parley.identity.v1.IdentityService/LookupByUsername".into()),
        );
        return encode_ok(
            &LookupByUsernameResponse {
                success: false,
                error: Some(err("FailedPrecondition", msg)),
                ..Default::default()
            },
            enc,
        );
    };
    let Some(game) = proto_game_to_db(req.game) else {
        let msg = "game must be R6".to_string();
        ctx.axiom.log_error(
            "identity.lookup_by_username",
            "InvalidArgument",
            &msg,
            Some("/parley.identity.v1.IdentityService/LookupByUsername".into()),
        );
        return encode_ok(
            &LookupByUsernameResponse {
                success: false,
                error: Some(err("InvalidArgument", msg)),
                ..Default::default()
            },
            enc,
        );
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("db pool: {e}");
            ctx.axiom.log_error(
                "identity.lookup_by_username",
                "Internal",
                &msg,
                Some("/parley.identity.v1.IdentityService/LookupByUsername".into()),
            );
            return encode_ok(
                &LookupByUsernameResponse {
                    success: false,
                    error: Some(err("Internal", msg)),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let player =
        match PlayerRepo::find_by_identity(&mut conn, game, &req.username, &req.platform).await {
            Ok(p) => p,
            Err(e) => {
                let msg = format!("lookup: {e}");
                ctx.axiom.log_error(
                    "identity.lookup_by_username",
                    "Internal",
                    &msg,
                    Some("/parley.identity.v1.IdentityService/LookupByUsername".into()),
                );
                return encode_ok(
                    &LookupByUsernameResponse {
                        success: false,
                        error: Some(err("Internal", msg)),
                        ..Default::default()
                    },
                    enc,
                );
            }
        };

    let identity = match player {
        Some(p) => {
            // Discord side may or may not be linked; if it is, pull the first match.
            let discord_user_id = DiscordIdentityRepo::find_by_discord(&mut conn, Some(p.game), "")
                .await
                .ok()
                .and_then(|v| v.into_iter().next())
                .map(|i| i.discord_user_id)
                .unwrap_or_default();
            Some(player_to_linked(&discord_user_id, p, game))
        }
        None => None,
    };

    encode_ok(
        &LookupByUsernameResponse {
            success: true,
            identity,
            error: None,
        },
        enc,
    )
}

fn player_to_linked(discord_user_id: &str, p: Player, game: DbGame) -> LinkedIdentity {
    LinkedIdentity {
        game: db_game_to_proto(game),
        discord_user_id: discord_user_id.to_string(),
        player_id: p.id,
        username: p.username,
        username_normalized: p.username_normalized,
        platform: p.platform,
        profile_id: p.profile_id.unwrap_or_default(),
        profile_url: p.profile_url.unwrap_or_default(),
        internal_elo: p.internal_elo,
        internal_matches: p.internal_matches,
        internal_wins: p.internal_wins,
        internal_losses: p.internal_losses,
    }
}
