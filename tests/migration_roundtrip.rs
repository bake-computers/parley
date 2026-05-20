//! Migration round-trip test.
//!
//! Applies all embedded migrations against a live Postgres, then runs them
//! back down to zero. Gated on `DATABASE_URL` so CI / dev environments
//! without a database just get a no-op.
//!
//! Usage (local):
//!   createdb parley_migration_test
//!   DATABASE_URL=postgres://$USER@localhost/parley_migration_test \
//!     cargo test --test migration_roundtrip

#![cfg(test)]

#[path = "../src/db/mod.rs"]
mod db;

use diesel::prelude::*;
use diesel_migrations::MigrationHarness;

#[test]
fn migrations_apply_and_revert_cleanly() {
    let Ok(url) = std::env::var("DATABASE_URL") else {
        eprintln!("[skip] DATABASE_URL not set");
        return;
    };

    let mut conn =
        diesel::pg::PgConnection::establish(&url).expect("connect to Postgres with DATABASE_URL");

    // Fresh apply.
    conn.run_pending_migrations(db::MIGRATIONS)
        .expect("run_pending_migrations up");

    // The 'games' enum should now exist.
    let enum_exists: i64 = diesel::dsl::sql::<diesel::sql_types::BigInt>(
        "SELECT COUNT(*)::bigint FROM pg_type WHERE typname = 'games'",
    )
    .get_result(&mut conn)
    .unwrap();
    assert_eq!(enum_exists, 1, "games enum missing after up-migration");

    // Revert each migration. `revert_all_migrations` isn't public in
    // diesel_migrations, so we iterate in reverse ourselves.
    let applied = conn
        .applied_migrations()
        .expect("listing applied migrations")
        .into_iter()
        .rev()
        .collect::<Vec<_>>();
    for _ in &applied {
        conn.revert_last_migration(db::MIGRATIONS)
            .expect("revert_last_migration");
    }

    // games type must be gone after full revert.
    let still_there: i64 = diesel::dsl::sql::<diesel::sql_types::BigInt>(
        "SELECT COUNT(*)::bigint FROM pg_type WHERE typname = 'games'",
    )
    .get_result(&mut conn)
    .unwrap();
    assert_eq!(still_there, 0, "games enum remained after down-migration");
}
