//! Tournament integration tests. Gated on `DATABASE_URL`.

#![cfg(test)]

#[path = "../src/db/mod.rs"]
mod db;

use db::Game;
use db::models::NewTournament;
use db::repos::now_ms;
use db::tournament_repos::{TOURNAMENT_STATUS_OPEN, TournamentRepo};
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
async fn tournament_create_and_list() {
    let Some(mut conn) = setup_conn().await else {
        eprintln!("[skip] DATABASE_URL not set");
        return;
    };

    let guild_id = format!("t_guild_{}", uuid::Uuid::new_v4());
    let now = now_ms();
    let row = NewTournament {
        game: Game::R6,
        name: "Friday Cup",
        name_normalized: "friday cup",
        format: "5v5 single_elimination",
        team_cap: 4,
        visibility: "public",
        status: TOURNAMENT_STATUS_OPEN,
        created_by_guild_id: &guild_id,
        created_by_channel_id: "chan",
        created_by_discord_user_id: "creator",
        hub_message_id: None,
        filled_at: None,
        auto_start_at: None,
        started_at: None,
        completed_at: None,
        winner_entry_id: None,
        created_at: now,
        updated_at: now,
    };

    let t = TournamentRepo::create(&mut conn, row)
        .await
        .expect("create");
    let listed = TournamentRepo::list_for_guild(&mut conn, Game::R6, &guild_id, None, 10)
        .await
        .expect("list");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, t.id);
}
