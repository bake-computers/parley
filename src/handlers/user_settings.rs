//! UserSettingsService — per-Discord-user preferences and GDPR data deletion.

use axum::{body::Bytes, extract::State, http::HeaderMap, response::Response};

use crate::connect::{decode_body, detect_encoding, encode_ok};
use crate::context::AppContext;
use crate::db::Game as DbGame;
use crate::db::Language as DbLanguage;
use crate::db::models::NewUserSettings;
use crate::db::repos::{
    AccountDeletionCooldownRepo, AnonymizationReport, GuildSettingsRepo, UserDataAnonymizationRepo,
    UserSettingsRepo, now_ms,
};
use crate::proto::common::v1::{Error as ProtoError, Game as ProtoGame, Language as ProtoLanguage};
use crate::proto::user::v1::{
    AnonymizationCounts, DeleteUserDataRequest, DeleteUserDataResponse, GetUserSettingsRequest,
    LanguageSource, ResolveLanguageRequest, ResolveLanguageResponse, UpsertUserSettingsRequest,
    UserSettings as ProtoUserSettings, UserSettingsResponse,
};

fn proto_game_to_db(v: i32) -> Option<DbGame> {
    match ProtoGame::try_from(v).unwrap_or(ProtoGame::Unspecified) {
        ProtoGame::R6 => Some(DbGame::R6),
        ProtoGame::Unspecified => None,
        _ => None,
    }
}

fn proto_lang_to_db(v: i32) -> Option<DbLanguage> {
    match ProtoLanguage::try_from(v).unwrap_or(ProtoLanguage::Unspecified) {
        ProtoLanguage::En => Some(DbLanguage::En),
        ProtoLanguage::De => Some(DbLanguage::De),
        ProtoLanguage::Unspecified => None,
    }
}

fn db_lang_to_proto(lang: DbLanguage) -> i32 {
    match lang {
        DbLanguage::En => ProtoLanguage::En as i32,
        DbLanguage::De => ProtoLanguage::De as i32,
    }
}

fn err(code: &str, msg: impl Into<String>) -> ProtoError {
    ProtoError {
        code: code.to_string(),
        message: msg.into(),
    }
}

fn need_language(lang: i32) -> Result<DbLanguage, ProtoError> {
    proto_lang_to_db(lang).ok_or_else(|| err("InvalidArgument", "language must be EN or DE"))
}

fn row_to_proto(row: &crate::db::models::UserSettings) -> ProtoUserSettings {
    ProtoUserSettings {
        discord_user_id: row.discord_user_id.clone(),
        language: db_lang_to_proto(row.language),
        updated_at_ms: row.updated_at,
        matchmaking_enabled: row.matchmaking_enabled,
        terms_accepted_at_ms: row.terms_accepted_at_ms,
        profile_public: row.profile_public,
        timezone: row.timezone.clone(),
    }
}

fn report_to_proto(report: &AnonymizationReport) -> AnonymizationCounts {
    AnonymizationCounts {
        players: report.players as i32,
        discord_identities: report.discord_identities as i32,
        guild_memberships: report.guild_memberships as i32,
        matches: report.matches as i32,
        match_participants: report.match_participants as i32,
        matchmaking_queues: report.matchmaking_queues as i32,
        matchmaking_queue_participants: report.matchmaking_queue_participants as i32,
        tournaments: report.tournaments as i32,
        tournament_teams: report.tournament_teams as i32,
        tournament_team_rosters: report.tournament_team_rosters as i32,
        guild_settings_audit: report.guild_settings_audit as i32,
        guild_match_quotas_audit: report.guild_match_quotas_audit as i32,
    }
}

fn deletion_hmac_secret() -> Result<String, ProtoError> {
    std::env::var("ACCOUNT_DELETION_HMAC_SECRET")
        .ok()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            err(
                "FailedPrecondition",
                "ACCOUNT_DELETION_HMAC_SECRET not configured",
            )
        })
}

pub async fn get_user_settings_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: GetUserSettingsRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    if req.discord_user_id.trim().is_empty() {
        return encode_ok(
            &UserSettingsResponse {
                success: false,
                error: Some(err("InvalidArgument", "discord_user_id is required")),
                ..Default::default()
            },
            enc,
        );
    }

    let Some(pool) = ctx.pool.clone() else {
        return encode_ok(
            &UserSettingsResponse {
                success: false,
                error: Some(err("FailedPrecondition", "DATABASE_URL not configured")),
                ..Default::default()
            },
            enc,
        );
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            return encode_ok(
                &UserSettingsResponse {
                    success: false,
                    error: Some(err("Internal", format!("db pool: {e}"))),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let settings = match UserSettingsRepo::get(&mut conn, &req.discord_user_id).await {
        Ok(Some(row)) => row_to_proto(&row),
        Ok(None) => ProtoUserSettings {
            discord_user_id: req.discord_user_id,
            language: ProtoLanguage::En as i32,
            updated_at_ms: 0,
            matchmaking_enabled: true,
            terms_accepted_at_ms: 0,
            profile_public: true,
            timezone: "UTC".to_string(),
        },
        Err(e) => {
            return encode_ok(
                &UserSettingsResponse {
                    success: false,
                    error: Some(err("Internal", format!("get: {e}"))),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    encode_ok(
        &UserSettingsResponse {
            success: true,
            settings: Some(settings),
            error: None,
        },
        enc,
    )
}

pub async fn upsert_user_settings_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: UpsertUserSettingsRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    let Some(s) = req.settings else {
        return encode_ok(
            &UserSettingsResponse {
                success: false,
                error: Some(err("InvalidArgument", "settings is required")),
                ..Default::default()
            },
            enc,
        );
    };
    if s.discord_user_id.trim().is_empty() {
        return encode_ok(
            &UserSettingsResponse {
                success: false,
                error: Some(err("InvalidArgument", "discord_user_id is required")),
                ..Default::default()
            },
            enc,
        );
    }
    let language = match need_language(s.language) {
        Ok(l) => l,
        Err(e) => {
            return encode_ok(
                &UserSettingsResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let Some(pool) = ctx.pool.clone() else {
        return encode_ok(
            &UserSettingsResponse {
                success: false,
                error: Some(err("FailedPrecondition", "DATABASE_URL not configured")),
                ..Default::default()
            },
            enc,
        );
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            return encode_ok(
                &UserSettingsResponse {
                    success: false,
                    error: Some(err("Internal", format!("db pool: {e}"))),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let now = now_ms();
    let new_row = NewUserSettings {
        discord_user_id: &s.discord_user_id,
        language,
        created_at: now,
        updated_at: now,
        matchmaking_enabled: s.matchmaking_enabled,
        terms_accepted_at_ms: s.terms_accepted_at_ms,
        profile_public: s.profile_public,
        timezone: if s.timezone.is_empty() {
            "UTC"
        } else {
            &s.timezone
        },
    };
    let saved = match UserSettingsRepo::upsert(&mut conn, new_row).await {
        Ok(row) => row,
        Err(e) => {
            return encode_ok(
                &UserSettingsResponse {
                    success: false,
                    error: Some(err("Internal", format!("upsert: {e}"))),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    encode_ok(
        &UserSettingsResponse {
            success: true,
            settings: Some(row_to_proto(&saved)),
            error: None,
        },
        enc,
    )
}

pub async fn resolve_language_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: ResolveLanguageRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    if req.discord_user_id.trim().is_empty() {
        return encode_ok(
            &ResolveLanguageResponse {
                success: false,
                error: Some(err("InvalidArgument", "discord_user_id is required")),
                ..Default::default()
            },
            enc,
        );
    }

    let Some(pool) = ctx.pool.clone() else {
        return encode_ok(
            &ResolveLanguageResponse {
                success: false,
                error: Some(err("FailedPrecondition", "DATABASE_URL not configured")),
                ..Default::default()
            },
            enc,
        );
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            return encode_ok(
                &ResolveLanguageResponse {
                    success: false,
                    error: Some(err("Internal", format!("db pool: {e}"))),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    if let Ok(Some(user_row)) = UserSettingsRepo::get(&mut conn, &req.discord_user_id).await {
        return encode_ok(
            &ResolveLanguageResponse {
                success: true,
                language: db_lang_to_proto(user_row.language),
                source: LanguageSource::User as i32,
                error: None,
            },
            enc,
        );
    }

    if !req.guild_id.trim().is_empty()
        && let Some(game) = proto_game_to_db(req.game)
        && let Ok(Some(guild_row)) = GuildSettingsRepo::get(&mut conn, &req.guild_id, game).await
    {
        return encode_ok(
            &ResolveLanguageResponse {
                success: true,
                language: db_lang_to_proto(guild_row.default_language),
                source: LanguageSource::Guild as i32,
                error: None,
            },
            enc,
        );
    }

    encode_ok(
        &ResolveLanguageResponse {
            success: true,
            language: ProtoLanguage::En as i32,
            source: LanguageSource::Default as i32,
            error: None,
        },
        enc,
    )
}

pub async fn delete_user_data_rpc(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let enc = detect_encoding(&headers);
    let req: DeleteUserDataRequest = match decode_body(enc, &body) {
        Ok(r) => r,
        Err(r) => return r,
    };
    if req.discord_user_id.trim().is_empty() {
        return encode_ok(
            &DeleteUserDataResponse {
                success: false,
                error: Some(err("InvalidArgument", "discord_user_id is required")),
                ..Default::default()
            },
            enc,
        );
    }

    let secret = match deletion_hmac_secret() {
        Ok(s) => s,
        Err(e) => {
            return encode_ok(
                &DeleteUserDataResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let Some(pool) = ctx.pool.clone() else {
        return encode_ok(
            &DeleteUserDataResponse {
                success: false,
                error: Some(err("FailedPrecondition", "DATABASE_URL not configured")),
                ..Default::default()
            },
            enc,
        );
    };

    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(e) => {
            return encode_ok(
                &DeleteUserDataResponse {
                    success: false,
                    error: Some(err("Internal", format!("db pool: {e}"))),
                    ..Default::default()
                },
                enc,
            );
        }
    };

    let report =
        match UserDataAnonymizationRepo::anonymize_all(&mut conn, &req.discord_user_id, &secret)
            .await
        {
            Ok(r) => r,
            Err(e) => {
                return encode_ok(
                    &DeleteUserDataResponse {
                        success: false,
                        error: Some(err("Internal", format!("anonymize: {e}"))),
                        ..Default::default()
                    },
                    enc,
                );
            }
        };

    if report.anonymized_discord_user_id.is_empty() {
        return encode_ok(
            &DeleteUserDataResponse {
                success: false,
                error: Some(err(
                    "NotFound",
                    "no linked account found for this discord user",
                )),
                ..Default::default()
            },
            enc,
        );
    }

    let cooldown_until =
        AccountDeletionCooldownRepo::is_blocked(&mut conn, &req.discord_user_id, &secret)
            .await
            .ok()
            .flatten()
            .unwrap_or(now_ms() + crate::db::repos::DELETION_COOLDOWN_MS);

    let anonymized_id = report.anonymized_discord_user_id.clone();
    encode_ok(
        &DeleteUserDataResponse {
            success: true,
            anonymized_discord_user_id: anonymized_id,
            cooldown_until_ms: cooldown_until,
            tables_affected: Some(report_to_proto(&report)),
            error: None,
        },
        enc,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_mapping_round_trip() {
        assert_eq!(
            proto_lang_to_db(ProtoLanguage::En as i32),
            Some(DbLanguage::En)
        );
        assert_eq!(
            proto_lang_to_db(ProtoLanguage::De as i32),
            Some(DbLanguage::De)
        );
        assert_eq!(proto_lang_to_db(0), None);
        assert_eq!(db_lang_to_proto(DbLanguage::En), ProtoLanguage::En as i32);
        assert_eq!(db_lang_to_proto(DbLanguage::De), ProtoLanguage::De as i32);
    }

    fn fake_row() -> crate::db::models::UserSettings {
        crate::db::models::UserSettings {
            discord_user_id: "u1".to_string(),
            language: DbLanguage::De,
            created_at: 1_000,
            updated_at: 2_000,
            matchmaking_enabled: false,
            terms_accepted_at_ms: 0,
            profile_public: false,
            timezone: "Europe/Berlin".to_string(),
        }
    }

    #[test]
    fn row_to_proto_carries_new_fields() {
        let p = row_to_proto(&fake_row());
        assert_eq!(p.terms_accepted_at_ms, 0);
        assert_eq!(p.profile_public, false);
    }
}
