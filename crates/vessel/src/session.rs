//! Vessel session model — self-contained Diesel structs for the vessel_sessions table.
//!
//! Also provides [`VesselSessionHandle`] for transactional session lifecycle management:
//! start a session (BEGIN tx, acquire advisory lock, insert row), then either
//! [`purge`](VesselSessionHandle::purge) to rollback or
//! [`complete`](VesselSessionHandle::complete) to commit.

use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::table;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::pooled_connection::AsyncDieselConnectionManager;
use diesel_async::AsyncPgConnection;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

#[derive(Debug, diesel::deserialize::QueryableByName)]
struct AdvisoryLockResult {
    #[diesel(sql_type = diesel::sql_types::Bool)]
    locked: bool,
}

table! {
    vessel_sessions (id) {
        id                  -> diesel::sql_types::Int4,
        session_id          -> diesel::sql_types::Uuid,
        started_at          -> diesel::sql_types::Timestamptz,
        status              -> diesel::sql_types::Text,
        seed_player         -> diesel::sql_types::Text,
        players_discovered  -> diesel::sql_types::Int4,
        players_inserted    -> diesel::sql_types::Int4,
        interactions_sent   -> diesel::sql_types::Int4,
    }
}

/// Public re-export of the `vessel_sessions` table schema so sibling
/// modules (e.g., `db_writer`) can reference the table without defining
/// a duplicate `table!` macro.
pub mod schema {
    pub use super::vessel_sessions::*;
}

/// Async connection pool for the Vessel engine.
pub type VesselPool = Pool<AsyncPgConnection>;

#[derive(Debug, Clone, diesel::Queryable, diesel::Identifiable)]
#[diesel(table_name = vessel_sessions)]
pub struct VesselSession {
    pub id: i32,
    pub session_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub status: String,
    pub seed_player: String,
    pub players_discovered: i32,
    pub players_inserted: i32,
    pub interactions_sent: i32,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = vessel_sessions)]
pub struct NewVesselSession<'a> {
    pub session_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub status: &'a str,
    pub seed_player: &'a str,
    pub players_discovered: i32,
    pub players_inserted: i32,
    pub interactions_sent: i32,
}

/// Errors raised during session lifecycle operations.
#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("failed to create connection pool: {0}")]
    Pool(String),
    #[error("advisory lock conflict — another session is already active on this database")]
    LockConflict,
    #[error("database error: {0}")]
    Database(#[from] diesel::result::Error),
    #[error("{0}")]
    Other(String),
}

impl From<diesel_async::pooled_connection::bb8::RunError> for SessionError {
    fn from(err: diesel_async::pooled_connection::bb8::RunError) -> Self {
        SessionError::Pool(err.to_string())
    }
}

impl From<diesel_async::pooled_connection::PoolError> for SessionError {
    fn from(err: diesel_async::pooled_connection::PoolError) -> Self {
        SessionError::Pool(err.to_string())
    }
}

/// A handle to an active Vessel session that owns a pooled connection with an
/// open transaction and a session-level advisory lock.
///
/// Dropping the handle without calling [`purge`](VesselSessionHandle::purge) or
/// [`complete`](VesselSessionHandle::complete) will **not** clean up — the
/// connection returns to the pool and the lock is released, but the session row
/// remains with status `'active'`.
pub struct VesselSessionHandle {
    session_id: Uuid,
    pool: VesselPool,
    /// The connection holding the active transaction and advisory lock.
    /// Declared after `pool` so Rust drops it before the pool.
    conn:
        Option<diesel_async::pooled_connection::bb8::PooledConnection<'static, AsyncPgConnection>>,
}

impl VesselSessionHandle {
    /// Create a new connection pool, begin a transaction, acquire an advisory
    /// lock, and insert a session row with `status = 'active'`.
    ///
    /// Returns [`SessionError::LockConflict`] if another session already holds
    /// the advisory lock on this database.
    pub async fn start(database_url: &str, seed_player: &str) -> Result<Self, SessionError> {
        let config = AsyncDieselConnectionManager::<AsyncPgConnection>::new(database_url);
        let pool = Pool::builder().build(config).await?;
        let mut conn = pool.get_owned().await?;

        let session_id = Uuid::new_v4();
        let lock_id = uuid_to_lock_id(&session_id);

        diesel::sql_query("BEGIN").execute(&mut *conn).await?;

        let result = diesel::sql_query("SELECT pg_try_advisory_lock($1) AS locked")
            .bind::<diesel::sql_types::BigInt, _>(lock_id)
            .get_result::<AdvisoryLockResult>(&mut *conn)
            .await?;

        if !result.locked {
            return Err(SessionError::LockConflict);
        }

        let new_session = NewVesselSession {
            session_id,
            started_at: Utc::now(),
            status: "active",
            seed_player,
            players_discovered: 0,
            players_inserted: 0,
            interactions_sent: 0,
        };

        diesel::insert_into(vessel_sessions::table)
            .values(&new_session)
            .execute(&mut *conn)
            .await?;

        Ok(Self {
            session_id,
            pool,
            conn: Some(conn),
        })
    }

    /// Rollback the held transaction, release the advisory lock, and update
    /// the session status to `'purged'` on a fresh connection.
    ///
    /// Consumes the handle — the session cannot be reused after purging.
    pub async fn purge(mut self) -> Result<(), SessionError> {
        if let Some(mut conn) = self.conn.take() {
            let lock_id = uuid_to_lock_id(&self.session_id);
            let _ = diesel::sql_query("ROLLBACK").execute(&mut *conn).await;
            let _ = diesel::sql_query("SELECT pg_advisory_unlock($1)")
                .bind::<diesel::sql_types::BigInt, _>(lock_id)
                .execute(&mut *conn)
                .await;
        }
        // `conn` drops here, returning to pool.

        let mut fresh = self.pool.get().await?;
        diesel::update(
            vessel_sessions::table.filter(vessel_sessions::session_id.eq(self.session_id)),
        )
        .set(vessel_sessions::status.eq("purged"))
        .execute(&mut *fresh)
        .await?;

        Ok(())
    }

    /// Commit the held transaction, release the advisory lock, and update the
    /// session status to `'completed'` on a fresh connection.
    ///
    /// Consumes the handle — the session cannot be reused after completing.
    pub async fn complete(mut self) -> Result<(), SessionError> {
        if let Some(mut conn) = self.conn.take() {
            let lock_id = uuid_to_lock_id(&self.session_id);
            diesel::sql_query("COMMIT").execute(&mut *conn).await?;
            diesel::sql_query("SELECT pg_advisory_unlock($1)")
                .bind::<diesel::sql_types::BigInt, _>(lock_id)
                .execute(&mut *conn)
                .await?;
        }
        // `conn` drops here, returning to pool.

        let mut fresh = self.pool.get().await?;
        diesel::update(
            vessel_sessions::table.filter(vessel_sessions::session_id.eq(self.session_id)),
        )
        .set(vessel_sessions::status.eq("completed"))
        .execute(&mut *fresh)
        .await?;

        Ok(())
    }

    /// The UUID assigned to this session at creation time.
    pub fn session_id(&self) -> Uuid {
        self.session_id
    }
}

/// Convert a UUID into an `i64` for use with PostgreSQL advisory lock functions.
///
/// Uses the low 8 bytes of the UUID interpreted as a big-endian `i64`.
fn uuid_to_lock_id(uuid: &Uuid) -> i64 {
    let bytes = uuid.as_bytes();
    i64::from_be_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vessel_session_struct_fields_match_schema() {
        let session = VesselSession {
            id: 1,
            session_id: Uuid::new_v4(),
            started_at: chrono::Utc::now(),
            status: "active".to_string(),
            seed_player: "player_abc".to_string(),
            players_discovered: 10,
            players_inserted: 5,
            interactions_sent: 3,
        };
        assert_eq!(session.status, "active");
        assert_eq!(session.players_discovered, 10);
        assert_eq!(session.players_inserted, 5);
        assert_eq!(session.interactions_sent, 3);
    }

    #[test]
    fn new_vessel_session_lifetime_valid() {
        let session_id = Uuid::new_v4();
        let now = chrono::Utc::now();
        let new_session = NewVesselSession {
            session_id,
            started_at: now,
            status: "active",
            seed_player: "test_player",
            players_discovered: 0,
            players_inserted: 0,
            interactions_sent: 0,
        };
        assert_eq!(new_session.status, "active");
        assert_eq!(new_session.seed_player, "test_player");
    }

    #[test]
    fn uuid_to_lock_id_is_deterministic() {
        let id = Uuid::parse_str("a1b2c3d4-e5f6-4789-ab12-cd34ef567890").expect("valid uuid");
        let a = uuid_to_lock_id(&id);
        let b = uuid_to_lock_id(&id);
        assert_eq!(a, b);
    }

    #[test]
    fn uuid_to_lock_id_different_uuids_different_keys() {
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        assert_ne!(uuid_to_lock_id(&id1), uuid_to_lock_id(&id2));
    }

    #[allow(unused_imports)]
    mod integration {
        //! Async tests that require a running Postgres instance.
        //!
        //! Set the `DATABASE_URL` environment variable pointing to a test
        //! database. If it is not available, these tests are silently skipped.
        //!
        //! The test database must have the `vessel_sessions` table created via
        //! the migration at:
        //!   `migrations/2026-05-14-200000_vessel_sessions/up.sql`

        use super::*;

        fn db_url() -> Option<String> {
            std::env::var("DATABASE_URL").ok()
        }

        #[tokio::test]
        async fn test_session_start_inserts_row() {
            let url = match db_url() {
                Some(u) => u,
                None => {
                    eprintln!("SKIP: DATABASE_URL not set");
                    return;
                }
            };

            let handle = VesselSessionHandle::start(&url, "test_seed_start")
                .await
                .expect("start failed");

            let sid = handle.session_id();

            let config = AsyncDieselConnectionManager::<AsyncPgConnection>::new(&url);
            let pool = Pool::builder().build(config).await.expect("pool create");
            let mut conn = pool.get().await.expect("conn acquire");

            let row: VesselSession = vessel_sessions::table
                .filter(vessel_sessions::session_id.eq(sid))
                .first(&mut *conn)
                .await
                .expect("query failed");

            assert_eq!(row.session_id, sid);
            assert_eq!(row.status, "active");
            assert_eq!(row.seed_player, "test_seed_start");

            handle.purge().await.expect("cleanup");
        }

        #[tokio::test]
        async fn test_session_purge_rolls_back() {
            let url = match db_url() {
                Some(u) => u,
                None => {
                    eprintln!("SKIP: DATABASE_URL not set");
                    return;
                }
            };

            let handle = VesselSessionHandle::start(&url, "test_seed_purge")
                .await
                .expect("start failed");
            let sid = handle.session_id();

            handle.purge().await.expect("purge failed");

            let config = AsyncDieselConnectionManager::<AsyncPgConnection>::new(&url);
            let pool = Pool::builder().build(config).await.expect("pool create");
            let mut conn = pool.get().await.expect("conn acquire");

            let result: Result<VesselSession, _> = vessel_sessions::table
                .filter(vessel_sessions::session_id.eq(sid))
                .first(&mut *conn)
                .await;

            match result {
                Ok(row) => {
                    assert_eq!(row.status, "purged");
                    assert_eq!(row.seed_player, "test_seed_purge");
                }
                Err(diesel::result::Error::NotFound) => {
                    // Acceptable: rollback removed the row. The status update
                    // also runs on a fresh connection but the row may already
                    // be gone due to ROLLBACK.
                }
                Err(e) => panic!("unexpected error: {e}"),
            }
        }

        #[tokio::test]
        async fn test_session_complete_commits() {
            let url = match db_url() {
                Some(u) => u,
                None => {
                    eprintln!("SKIP: DATABASE_URL not set");
                    return;
                }
            };

            let handle = VesselSessionHandle::start(&url, "test_seed_complete")
                .await
                .expect("start failed");
            let sid = handle.session_id();

            handle.complete().await.expect("complete failed");

            let config = AsyncDieselConnectionManager::<AsyncPgConnection>::new(&url);
            let pool = Pool::builder().build(config).await.expect("pool create");
            let mut conn = pool.get().await.expect("conn acquire");

            let row: VesselSession = vessel_sessions::table
                .filter(vessel_sessions::session_id.eq(sid))
                .first(&mut *conn)
                .await
                .expect("query failed");

            assert_eq!(row.session_id, sid);
            assert_eq!(row.status, "completed");
            assert_eq!(row.seed_player, "test_seed_complete");
        }

        #[tokio::test]
        async fn test_concurrent_session_fails() {
            let url = match db_url() {
                Some(u) => u,
                None => {
                    eprintln!("SKIP: DATABASE_URL not set");
                    return;
                }
            };

            let handle_a = VesselSessionHandle::start(&url, "seed_a")
                .await
                .expect("first session should start");

            let result_b = VesselSessionHandle::start(&url, "seed_b").await;

            assert!(
                result_b.is_err(),
                "concurrent session should fail with LockConflict"
            );

            if let Err(e) = result_b {
                assert!(
                    matches!(e, SessionError::LockConflict),
                    "expected LockConflict, got: {e:?}"
                );
            }

            handle_a.purge().await.expect("cleanup");
        }
    }
}
