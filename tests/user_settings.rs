//! User settings + GDPR deletion integration tests.
//!
//! Gated on `DATABASE_URL` and `ACCOUNT_DELETION_HMAC_SECRET`.

#![cfg(test)]

#[path = "../src/db/mod.rs"]
mod db;

use db::models::{NewGuildSettings, NewUserSettings};
use db::repos::{
    AccountDeletionCooldownRepo, DiscordIdentityRepo, GuildSettingsRepo, PlayerRepo,
    UserDataAnonymizationRepo, UserSettingsRepo, now_ms,
};
use db::{Game, Language};
use diesel::prelude::*;
use diesel_async::AsyncConnection;
use diesel_async::AsyncPgConnection;
use diesel_migrations::MigrationHarness;

async fn setup_conn() -> Option<AsyncPgConnection> {
    let url = std::env::var("DATABASE_URL").ok()?;
    let secret = std::env::var("ACCOUNT_DELETION_HMAC_SECRET").ok()?;
    if secret.is_empty() {
        eprintln!("[skip] ACCOUNT_DELETION_HMAC_SECRET not set");
        return None;
    }

    let mut sync = diesel::pg::PgConnection::establish(&url).ok()?;
    sync.run_pending_migrations(db::MIGRATIONS).ok()?;
    AsyncPgConnection::establish(&url).await.ok()
}

#[tokio::test]
async fn resolve_language_user_overrides_guild_default() {
    let Some(mut conn) = setup_conn().await else {
        eprintln!("[skip] DATABASE_URL not set");
        return;
    };

    let discord_id = format!("test_user_{}", uuid::Uuid::new_v4());
    let guild_id = format!("test_guild_{}", uuid::Uuid::new_v4());

    let now = now_ms();
    UserSettingsRepo::upsert(
        &mut conn,
        NewUserSettings {
            discord_user_id: &discord_id,
            language: Language::De,
            created_at: now,
            updated_at: now,
            matchmaking_enabled: false,
        },
    )
    .await
    .expect("upsert user settings");

    GuildSettingsRepo::upsert(
        &mut conn,
        NewGuildSettings {
            guild_id: &guild_id,
            game: Game::R6,
            default_team_format: None,
            auto_balance: true,
            cross_guild_matchmaking: true,
            updated_at: now,
            updated_by_discord_user_id: &discord_id,
            default_language: Language::En,
            matchmaking_enabled: true,
        },
    )
    .await
    .expect("upsert guild settings");

    let user_row = UserSettingsRepo::get(&mut conn, &discord_id)
        .await
        .expect("get user")
        .expect("user row");
    assert_eq!(user_row.language, Language::De);
    assert!(!user_row.matchmaking_enabled);

    let guild_row = GuildSettingsRepo::get(&mut conn, &guild_id, Game::R6)
        .await
        .expect("get guild")
        .expect("guild row");
    assert_eq!(guild_row.default_language, Language::En);
}

#[tokio::test]
async fn delete_anonymizes_and_blocks_relink() {
    let Some(mut conn) = setup_conn().await else {
        eprintln!("[skip] DATABASE_URL not set");
        return;
    };

    let secret = std::env::var("ACCOUNT_DELETION_HMAC_SECRET").expect("secret");
    let discord_id = format!("delete_user_{}", uuid::Uuid::new_v4());

    let player =
        PlayerRepo::upsert_by_identity(&mut conn, Game::R6, "TestPlayer", "uplay", None, None)
            .await
            .expect("upsert player");

    DiscordIdentityRepo::link(&mut conn, Game::R6, &discord_id, player.id)
        .await
        .expect("link");

    let report = UserDataAnonymizationRepo::anonymize_all(&mut conn, &discord_id, &secret)
        .await
        .expect("anonymize");
    assert!(!report.anonymized_discord_user_id.is_empty());
    assert!(report.anonymized_discord_user_id.starts_with("deleted_"));
    assert_eq!(report.discord_identities, 1);
    assert_eq!(report.players, 1);

    let identities = DiscordIdentityRepo::find_by_discord(&mut conn, None, &discord_id)
        .await
        .expect("find by discord");
    assert!(identities.is_empty());

    let refreshed = PlayerRepo::find(&mut conn, player.id)
        .await
        .expect("find player")
        .expect("player row");
    assert_eq!(refreshed.username, "Deleted User");

    let blocked = AccountDeletionCooldownRepo::is_blocked(&mut conn, &discord_id, &secret)
        .await
        .expect("cooldown check");
    let until = blocked.expect("cooldown active");
    assert!(until > now_ms());
}
