//! Matchmaking integration tests (BuildTeams + ListGuildMembers).
//!
//! Gated on `DATABASE_URL`.

#![cfg(test)]

#[path = "../src/db/mod.rs"]
mod db;

use db::models::NewPlayerStatSnapshot;
use db::repos::{
    DiscordIdentityRepo, GuildMembershipRepo, GuildSettingsRepo, PlayerRepo,
    PlayerStatSnapshotRepo, now_ms,
};
use db::{Game, Language};
use diesel::Connection;
use diesel_async::{AsyncConnection, AsyncPgConnection};
use diesel_migrations::MigrationHarness;

async fn setup_conn() -> Option<AsyncPgConnection> {
    let url = std::env::var("DATABASE_URL").ok()?;
    let mut sync = diesel::pg::PgConnection::establish(&url).ok()?;
    sync.run_pending_migrations(db::MIGRATIONS).ok()?;
    AsyncPgConnection::establish(&url).await.ok()
}

#[tokio::test]
async fn list_guild_members_returns_registered_roster() {
    let Some(mut conn) = setup_conn().await else {
        eprintln!("[skip] DATABASE_URL not set");
        return;
    };

    let guild_id = format!("mm_guild_{}", uuid::Uuid::new_v4());
    let discord_ids: Vec<String> = (0..3)
        .map(|i| format!("mm_user_{}_{i}", uuid::Uuid::new_v4()))
        .collect();

    for (i, discord_id) in discord_ids.iter().enumerate() {
        let player = PlayerRepo::upsert_by_identity(
            &mut conn,
            Game::R6,
            &format!("MMPlayer{i}"),
            "pc",
            None,
            None,
        )
        .await
        .expect("upsert player");
        DiscordIdentityRepo::link(&mut conn, Game::R6, discord_id, player.id)
            .await
            .expect("link");
        GuildMembershipRepo::upsert(&mut conn, Game::R6, &guild_id, discord_id, player.id)
            .await
            .expect("membership");
    }

    let rows = GuildMembershipRepo::list_for_guild(&mut conn, Game::R6, &guild_id)
        .await
        .expect("list");
    assert_eq!(rows.len(), 3);
}

#[tokio::test]
async fn build_teams_data_layer_loads_snapshots_and_memberships() {
    let Some(mut conn) = setup_conn().await else {
        eprintln!("[skip] DATABASE_URL not set");
        return;
    };

    let guild_id = format!("mm_build_{}", uuid::Uuid::new_v4());
    let now = now_ms();
    let mut discord_ids = Vec::new();
    let mut player_ids = Vec::new();

    for i in 0..10 {
        let discord_id = format!("mm_build_user_{}_{i}", uuid::Uuid::new_v4());
        let player = PlayerRepo::upsert_by_identity(
            &mut conn,
            Game::R6,
            &format!("BuildPlayer{i}"),
            "pc",
            None,
            None,
        )
        .await
        .expect("upsert");
        DiscordIdentityRepo::link(&mut conn, Game::R6, &discord_id, player.id)
            .await
            .expect("link");
        GuildMembershipRepo::upsert(&mut conn, Game::R6, &guild_id, &discord_id, player.id)
            .await
            .expect("membership");

        let metadata = serde_json::json!({
            "rounds_played": 100,
            "kill_rounds": 40,
            "survival_rounds": 30,
            "traded_rounds": 10,
        });
        PlayerStatSnapshotRepo::insert(
            &mut conn,
            NewPlayerStatSnapshot {
                player_id: player.id,
                game: Game::R6,
                fetched_at: now,
                source: "test",
                cache_version: 1,
                current_rank: Some("gold"),
                rank_points: 3000 + i * 50,
                matches: 100,
                wins: 50 + i,
                losses: 50 - i,
                kills: 500 + i * 10,
                deaths: 400,
                assists: 100,
                headshots: 200,
                kd_ratio: 1.0 + (i as f64) * 0.05,
                headshot_percentage: 40.0,
                win_rate: 50.0 + i as f64,
                kost: 60.0,
                metadata: Some(metadata),
                payload_json: "{}",
                created_at: now,
            },
        )
        .await
        .expect("snapshot");

        discord_ids.push(discord_id);
        player_ids.push(player.id);
    }

    GuildSettingsRepo::upsert(
        &mut conn,
        db::models::NewGuildSettings {
            guild_id: &guild_id,
            game: Game::R6,
            default_team_format: Some("5v5"),
            auto_balance: true,
            cross_guild_matchmaking: false,
            updated_at: now,
            updated_by_discord_user_id: &discord_ids[0],
            default_language: Language::En,
            matchmaking_enabled: true,
        },
    )
    .await
    .expect("guild settings");

    let loaded =
        GuildMembershipRepo::find_many_by_discord_ids(&mut conn, Game::R6, &guild_id, &discord_ids)
            .await
            .expect("find many");
    assert_eq!(loaded.len(), 10);

    let snaps = PlayerStatSnapshotRepo::latest_for_players(&mut conn, Game::R6, &player_ids)
        .await
        .expect("snapshots");
    assert_eq!(snaps.len(), 10);
}
