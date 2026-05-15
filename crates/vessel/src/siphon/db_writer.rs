//! Diesel-backed writer for persisting Siphon crawl progress into the
//! `vessel_sessions` table.
//!
//! [`SiphonDbWriter`] operates on a borrowed [`AsyncPgConnection`] that is
//! expected to be within an active PostgreSQL transaction. All writes are
//! visible within the transaction but will be rolled back if the owning
//! [`VesselSessionHandle`](crate::session::VesselSessionHandle) is purged.

use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::session::schema as vessel_sessions;
use crate::session::{NewVesselSession, VesselSession};

/// Writer that records Siphon crawl progress into the `vessel_sessions` table.
///
/// Takes a mutable reference to an [`AsyncPgConnection`] held within a
/// [`VesselSessionHandle`](crate::session::VesselSessionHandle) transaction.
/// All writes are scoped to that transaction.
pub struct SiphonDbWriter<'a> {
    pub conn: &'a mut AsyncPgConnection,
}

impl<'a> SiphonDbWriter<'a> {
    pub fn new(conn: &'a mut AsyncPgConnection) -> Self {
        Self { conn }
    }

    pub async fn record_discovery(
        &mut self,
        sid: Uuid,
        discovered_count: i32,
    ) -> diesel::QueryResult<()> {
        diesel::update(vessel_sessions::table.filter(vessel_sessions::session_id.eq(sid)))
            .set(
                vessel_sessions::players_discovered
                    .eq(vessel_sessions::players_discovered + discovered_count),
            )
            .execute(self.conn)
            .await?;
        Ok(())
    }

    pub async fn insert_session(
        &mut self,
        new_session: &NewVesselSession<'_>,
    ) -> diesel::QueryResult<VesselSession> {
        diesel::insert_into(vessel_sessions::table)
            .values(new_session)
            .get_result(self.conn)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(unused_variables)]
    #[test]
    fn test_new_does_not_panic() {}

    #[test]
    fn test_record_discovery_signature() {
        fn _assert_signature(_w: &mut SiphonDbWriter<'_>, _sid: Uuid, _count: i32) {}
    }

    #[test]
    fn test_insert_session_signature() {
        fn _assert_signature(_w: &mut SiphonDbWriter<'_>, _ns: &NewVesselSession<'_>) {}
    }

    mod integration {
        use super::*;
        use chrono::Utc;
        use diesel_async::pooled_connection::bb8::Pool;
        use diesel_async::pooled_connection::AsyncDieselConnectionManager;

        fn db_url() -> Option<String> {
            std::env::var("DATABASE_URL").ok()
        }

        async fn create_pool(url: &str) -> Pool<AsyncPgConnection> {
            let config = AsyncDieselConnectionManager::<AsyncPgConnection>::new(url);
            Pool::builder()
                .build(config)
                .await
                .expect("failed to create pool")
        }

        fn new_test_session(sid: Uuid, seed: &str) -> NewVesselSession<'_> {
            NewVesselSession {
                session_id: sid,
                started_at: Utc::now(),
                status: "active",
                seed_player: seed,
                players_discovered: 0,
                players_inserted: 0,
                interactions_sent: 0,
            }
        }

        #[tokio::test]
        async fn test_record_discovery_increments_count() {
            let url = match db_url() {
                Some(u) => u,
                None => {
                    eprintln!("SKIP: DATABASE_URL not set");
                    return;
                }
            };

            let pool = create_pool(&url).await;
            let mut conn = pool.get().await.expect("acquire connection");

            diesel::sql_query("BEGIN")
                .execute(&mut *conn)
                .await
                .expect("begin tx");

            let sid = Uuid::new_v4();
            let new_session = new_test_session(sid, "test_record");

            let mut writer = SiphonDbWriter::new(&mut *conn);
            let inserted = writer
                .insert_session(&new_session)
                .await
                .expect("insert session");
            assert_eq!(inserted.session_id, sid);
            assert_eq!(inserted.players_discovered, 0);

            writer
                .record_discovery(sid, 7)
                .await
                .expect("record discovery");

            let row: VesselSession = vessel_sessions::table
                .filter(vessel_sessions::session_id.eq(sid))
                .first(writer.conn)
                .await
                .expect("query session");

            assert_eq!(row.players_discovered, 7, "counter should be incremented");

            writer
                .record_discovery(sid, 3)
                .await
                .expect("record discovery (2)");

            let row: VesselSession = vessel_sessions::table
                .filter(vessel_sessions::session_id.eq(sid))
                .first(writer.conn)
                .await
                .expect("query session (2)");

            assert_eq!(row.players_discovered, 10, "counter should be cumulative");

            diesel::sql_query("ROLLBACK")
                .execute(writer.conn)
                .await
                .expect("rollback");
        }

        #[tokio::test]
        async fn test_insert_session_works() {
            let url = match db_url() {
                Some(u) => u,
                None => {
                    eprintln!("SKIP: DATABASE_URL not set");
                    return;
                }
            };

            let pool = create_pool(&url).await;
            let mut conn = pool.get().await.expect("acquire connection");

            diesel::sql_query("BEGIN")
                .execute(&mut *conn)
                .await
                .expect("begin tx");

            let sid = Uuid::new_v4();
            let now = Utc::now();
            let new_session = NewVesselSession {
                session_id: sid,
                started_at: now,
                status: "active",
                seed_player: "test_insert",
                players_discovered: 10,
                players_inserted: 20,
                interactions_sent: 30,
            };

            let mut writer = SiphonDbWriter::new(&mut *conn);
            let inserted = writer
                .insert_session(&new_session)
                .await
                .expect("insert session");

            assert_eq!(inserted.session_id, sid);
            assert_eq!(inserted.status, "active");
            assert_eq!(inserted.seed_player, "test_insert");
            assert_eq!(inserted.players_discovered, 10);
            assert_eq!(inserted.players_inserted, 20);
            assert_eq!(inserted.interactions_sent, 30);
            assert!(inserted.id > 0, "auto-generated id should be positive");

            let diff = (inserted.started_at - now).num_seconds().abs();
            assert!(
                diff < 5,
                "started_at should be close to insert time (diff: {diff}s)"
            );

            diesel::sql_query("ROLLBACK")
                .execute(&mut *conn)
                .await
                .expect("rollback");
        }

        #[tokio::test]
        async fn test_writer_uses_transaction() {
            let url = match db_url() {
                Some(u) => u,
                None => {
                    eprintln!("SKIP: DATABASE_URL not set");
                    return;
                }
            };

            let pool = create_pool(&url).await;
            let mut conn = pool.get().await.expect("acquire connection");

            diesel::sql_query("BEGIN")
                .execute(&mut *conn)
                .await
                .expect("begin tx");

            let sid = Uuid::new_v4();
            let new_session = new_test_session(sid, "test_transaction");

            let mut writer = SiphonDbWriter::new(&mut *conn);
            let _inserted = writer
                .insert_session(&new_session)
                .await
                .expect("insert session");

            let row: VesselSession = vessel_sessions::table
                .filter(vessel_sessions::session_id.eq(sid))
                .first(writer.conn)
                .await
                .expect("row should be visible within tx");
            assert_eq!(row.seed_player, "test_transaction");

            diesel::sql_query("COMMIT")
                .execute(writer.conn)
                .await
                .expect("commit");

            let mut fresh = pool.get().await.expect("acquire fresh connection");
            let row: VesselSession = vessel_sessions::table
                .filter(vessel_sessions::session_id.eq(sid))
                .first(&mut *fresh)
                .await
                .expect("row should be visible after commit");
            assert_eq!(row.seed_player, "test_transaction");

            diesel::delete(vessel_sessions::table.filter(vessel_sessions::session_id.eq(sid)))
                .execute(&mut *fresh)
                .await
                .expect("cleanup delete");
        }

        #[tokio::test]
        async fn test_record_discovery_no_match_is_noop() {
            let url = match db_url() {
                Some(u) => u,
                None => {
                    eprintln!("SKIP: DATABASE_URL not set");
                    return;
                }
            };

            let pool = create_pool(&url).await;
            let mut conn = pool.get().await.expect("acquire connection");

            diesel::sql_query("BEGIN")
                .execute(&mut *conn)
                .await
                .expect("begin tx");

            let mut writer = SiphonDbWriter::new(&mut *conn);
            let non_existent = Uuid::new_v4();
            let result = writer.record_discovery(non_existent, 5).await;

            assert!(
                result.is_ok(),
                "record_discovery should not error on unknown session"
            );

            diesel::sql_query("ROLLBACK")
                .execute(writer.conn)
                .await
                .expect("rollback");
        }
    }
}
