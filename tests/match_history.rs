//! Integration tests for `MatchRepo::list_for_guild`, `list_for_user`, and
//! `get_by_uuid` (plus the username JOIN in `participants`).
//!
//! Gated on `DATABASE_URL`.

#![cfg(test)]

#[path = "../src/db/mod.rs"]
mod db;

use db::Game;
use db::matchmaking_repos::{MATCH_STATUS_PENDING, MatchRepo, decode_cursor, encode_cursor};
use db::models::{NewMatch, NewMatchParticipant};
use db::repos::{DiscordIdentityRepo, PlayerRepo, now_ms};
use diesel::Connection;
use diesel_async::{AsyncConnection, AsyncPgConnection};
use diesel_migrations::MigrationHarness;

async fn setup_conn() -> Option<AsyncPgConnection> {
    let url = std::env::var("DATABASE_URL").ok()?;
    let mut sync = diesel::pg::PgConnection::establish(&url).ok()?;
    sync.run_pending_migrations(db::MIGRATIONS).ok()?;
    AsyncPgConnection::establish(&url).await.ok()
}

fn build_match<'a>(
    game: Game,
    guild_id: &'a str,
    channel_id: &'a str,
    message_id: &'a str,
    created_by: &'a str,
    created_at: i64,
    public_uuid: &'a uuid::Uuid,
) -> NewMatch<'a> {
    NewMatch {
        game,
        guild_id,
        channel_id,
        message_id,
        created_by_discord_user_id: created_by,
        status: MATCH_STATUS_PENDING,
        match_type: "scrim",
        opponent_guild_id: None,
        opponent_channel_id: None,
        opponent_message_id: None,
        opponent_captain_discord_user_id: None,
        team_a_seed_total: 0.0,
        team_b_seed_total: 0.0,
        seed_gap: 0.0,
        winning_team: None,
        resolution_type: "unresolved",
        team_a_balance_total: 0.0,
        team_b_balance_total: 0.0,
        balance_gap: 0.0,
        created_at,
        updated_at: created_at,
        public_uuid: Some(public_uuid),
    }
}

#[tokio::test]
async fn list_for_guild_paginates() {
    let Some(mut conn) = setup_conn().await else {
        eprintln!("[skip] DATABASE_URL not set");
        return;
    };

    let guild_id = format!("mh_guild_{}", uuid::Uuid::new_v4());
    let creator = format!("mh_creator_{}", uuid::Uuid::new_v4());
    let base = now_ms();
    let mut ids = Vec::new();
    for i in 0..5 {
        let chan = format!("chan_{i}");
        let msg = format!("msg_{i}");
        let public_uuid = uuid::Uuid::new_v4();
        let row = build_match(
            Game::R6,
            &guild_id,
            &chan,
            &msg,
            &creator,
            base + i * 1000,
            &public_uuid,
        );
        let m = MatchRepo::create(&mut conn, row, vec![])
            .await
            .expect("create match");
        ids.push(m.0.id);
    }

    let first = MatchRepo::list_for_guild(&mut conn, Game::R6, &guild_id, 2, None)
        .await
        .expect("first page");
    assert_eq!(first.len(), 2);
    assert_eq!(first[0].id, ids[4]);
    assert_eq!(first[1].id, ids[3]);

    let cursor = encode_cursor(first[1].created_at, first[1].id);
    let decoded = decode_cursor(&cursor).expect("decode").expect("some");
    let second = MatchRepo::list_for_guild(&mut conn, Game::R6, &guild_id, 2, Some(decoded))
        .await
        .expect("second page");
    assert_eq!(second.len(), 2);
    assert_eq!(second[0].id, ids[2]);
    assert_eq!(second[1].id, ids[1]);
    let first_set: std::collections::HashSet<i32> = first.iter().map(|m| m.id).collect();
    let second_set: std::collections::HashSet<i32> = second.iter().map(|m| m.id).collect();
    assert!(first_set.is_disjoint(&second_set));
}

#[tokio::test]
async fn list_for_user_filters() {
    let Some(mut conn) = setup_conn().await else {
        eprintln!("[skip] DATABASE_URL not set");
        return;
    };

    let guild_id = format!("mh_userf_guild_{}", uuid::Uuid::new_v4());
    let user_x = format!("mh_user_x_{}", uuid::Uuid::new_v4());
    let user_y = format!("mh_user_y_{}", uuid::Uuid::new_v4());
    let base = now_ms();
    let player_x = PlayerRepo::upsert_by_identity(&mut conn, Game::R6, "UserX", "pc", None, None)
        .await
        .expect("upsert X");
    DiscordIdentityRepo::link(&mut conn, Game::R6, &user_x, player_x.id)
        .await
        .expect("link X");
    let player_y = PlayerRepo::upsert_by_identity(&mut conn, Game::R6, "UserY", "pc", None, None)
        .await
        .expect("upsert Y");
    DiscordIdentityRepo::link(&mut conn, Game::R6, &user_y, player_y.id)
        .await
        .expect("link Y");

    let creator = format!("mh_creator_{}", uuid::Uuid::new_v4());
    let mut ids = Vec::new();
    for i in 0..3 {
        let chan = format!("chan_{i}");
        let msg = format!("msg_{i}");
        let public_uuid = uuid::Uuid::new_v4();
        let row = build_match(
            Game::R6,
            &guild_id,
            &chan,
            &msg,
            &creator,
            base + i * 1000,
            &public_uuid,
        );
        let (m, _) = MatchRepo::create(
            &mut conn,
            row,
            vec![NewMatchParticipant {
                game: Game::R6,
                match_id: 0,
                discord_user_id: if i == 1 { &user_y } else { &user_x },
                player_id: if i == 1 { player_y.id } else { player_x.id },
                team: "a",
                slot: 0,
                seed_rank_points: 3000,
                seed_kd_ratio: 1.0,
                seed_kost: 0.6,
                seed_kpr: 0.5,
                seed_headshot_percentage: 40.0,
                seed_score: 100.0,
                balance_rating: 1000.0,
                kills: None,
                deaths: None,
                created_at: base + i * 1000,
                updated_at: base + i * 1000,
            }],
        )
        .await
        .expect("create match");
        ids.push(m.id);
    }

    let rows = MatchRepo::list_for_user(&mut conn, Game::R6, &user_x, 10, None)
        .await
        .expect("list for user X");
    let got: Vec<i32> = rows.iter().map(|m| m.id).collect();
    assert_eq!(
        got,
        vec![ids[2], ids[0]],
        "X participates in M0 and M2 only"
    );

    let rows_y = MatchRepo::list_for_user(&mut conn, Game::R6, &user_y, 10, None)
        .await
        .expect("list for user Y");
    let got_y: Vec<i32> = rows_y.iter().map(|m| m.id).collect();
    assert_eq!(got_y, vec![ids[1]], "Y participates in M1 only");
}

#[tokio::test]
async fn get_by_uuid_returns_match() {
    let Some(mut conn) = setup_conn().await else {
        eprintln!("[skip] DATABASE_URL not set");
        return;
    };

    let guild_id = format!("mh_uuid_guild_{}", uuid::Uuid::new_v4());
    let creator = format!("mh_creator_{}", uuid::Uuid::new_v4());
    let public_uuid = uuid::Uuid::new_v4();
    let (m, _) = MatchRepo::create(
        &mut conn,
        NewMatch {
            game: Game::R6,
            guild_id: &guild_id,
            channel_id: "chan",
            message_id: "msg",
            created_by_discord_user_id: &creator,
            status: MATCH_STATUS_PENDING,
            match_type: "scrim",
            opponent_guild_id: None,
            opponent_channel_id: None,
            opponent_message_id: None,
            opponent_captain_discord_user_id: None,
            team_a_seed_total: 0.0,
            team_b_seed_total: 0.0,
            seed_gap: 0.0,
            winning_team: None,
            resolution_type: "unresolved",
            team_a_balance_total: 0.0,
            team_b_balance_total: 0.0,
            balance_gap: 0.0,
            created_at: now_ms(),
            updated_at: now_ms(),
            public_uuid: Some(&public_uuid),
        },
        vec![],
    )
    .await
    .expect("create match");

    let fetched = MatchRepo::get_by_uuid(&mut conn, Game::R6, public_uuid)
        .await
        .expect("get_by_uuid");
    let row = fetched.expect("match should exist");
    assert_eq!(row.id, m.id);
    assert_eq!(row.public_uuid, public_uuid);

    let missing = MatchRepo::get_by_uuid(&mut conn, Game::R6, uuid::Uuid::new_v4())
        .await
        .expect("get_by_uuid for missing");
    assert!(missing.is_none(), "missing uuid returns None");
}

#[tokio::test]
async fn cursor_roundtrip() {
    let s = encode_cursor(1_700_000_000_000, 42);
    let decoded = decode_cursor(&s).expect("decode").expect("some");
    assert_eq!(decoded, (1_700_000_000_000, 42));
    assert!(decode_cursor("").expect("empty").is_none());
    assert!(decode_cursor("not-base64!!!").is_err());
}
