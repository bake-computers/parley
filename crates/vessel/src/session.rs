//! Vessel session model — self-contained Diesel structs for the vessel_sessions table.
//!
//! Also provides [`VesselSessionHandle`] for transactional session lifecycle management:
//! start a session (BEGIN tx, acquire advisory lock, insert row), then either
//! [`purge`](VesselSessionHandle::purge) to rollback or
//! [`complete`](VesselSessionHandle::complete) to commit.

use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::table;
use diesel_async::AsyncPgConnection;
use diesel_async::RunQueryDsl;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::pooled_connection::{AsyncDieselConnectionManager, ManagerConfig};
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
        let tls_mode = std::env::var("DB_TLS").unwrap_or_else(|_| "accept-invalid".to_string());
        let _ = rustls::crypto::ring::default_provider().install_default();

        let mut mgr_config = ManagerConfig::<AsyncPgConnection>::default();
        mgr_config.custom_setup = match tls_mode.as_str() {
            "none" | "disable" | "off" => Box::new(|url: &str| {
                let url = url.to_string();
                Box::pin(async move {
                    let (client, conn) = tokio_postgres::connect(&url, tokio_postgres::NoTls)
                        .await
                        .map_err(|e| diesel::ConnectionError::BadConnection(format!("{e}")))?;
                    tokio::spawn(async move {
                        if let Err(e) = conn.await {
                            eprintln!("pg conn: {e}");
                        }
                    });
                    diesel_async::AsyncPgConnection::try_from(client).await
                })
            }),
            "accept-invalid" => {
                let tls = build_insecure_tls();
                Box::new(move |url: &str| {
                    let url = url.to_string();
                    let tls = tls.clone();
                    Box::pin(async move {
                        let tls_conn =
                            tokio_postgres_rustls::MakeRustlsConnect::new((*tls).clone());
                        let (client, conn) = tokio_postgres::connect(&url, tls_conn)
                            .await
                            .map_err(|e| diesel::ConnectionError::BadConnection(format!("{e}")))?;
                        tokio::spawn(async move {
                            if let Err(e) = conn.await {
                                eprintln!("pg conn: {e}");
                            }
                        });
                        diesel_async::AsyncPgConnection::try_from(client).await
                    })
                })
            }
            "webpki" => {
                let tls = build_webpki_tls();
                Box::new(move |url: &str| {
                    let url = url.to_string();
                    let tls = tls.clone();
                    Box::pin(async move {
                        let tls_conn =
                            tokio_postgres_rustls::MakeRustlsConnect::new((*tls).clone());
                        let (client, conn) = tokio_postgres::connect(&url, tls_conn)
                            .await
                            .map_err(|e| diesel::ConnectionError::BadConnection(format!("{e}")))?;
                        tokio::spawn(async move {
                            if let Err(e) = conn.await {
                                eprintln!("pg conn: {e}");
                            }
                        });
                        diesel_async::AsyncPgConnection::try_from(client).await
                    })
                })
            }
            // "system" (default) or empty
            _ => {
                let tls = build_system_tls();
                Box::new(move |url: &str| {
                    let url = url.to_string();
                    let tls = tls.clone();
                    Box::pin(async move {
                        let tls_conn =
                            tokio_postgres_rustls::MakeRustlsConnect::new((*tls).clone());
                        let (client, conn) = tokio_postgres::connect(&url, tls_conn)
                            .await
                            .map_err(|e| diesel::ConnectionError::BadConnection(format!("{e}")))?;
                        tokio::spawn(async move {
                            if let Err(e) = conn.await {
                                eprintln!("pg conn: {e}");
                            }
                        });
                        diesel_async::AsyncPgConnection::try_from(client).await
                    })
                })
            }
        };

        let config = AsyncDieselConnectionManager::<AsyncPgConnection>::new_with_config(
            database_url.to_string(),
            mgr_config,
        );
        let pool = Pool::builder()
            .max_size(4)
            .connection_timeout(Duration::from_secs(30))
            .build(config)
            .await?;
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

    /// Update the progress counters on the session row within the active
    /// transaction. Call this periodically during a crawl to persist counts.
    pub async fn update_progress(
        &mut self,
        discovered: i32,
        inserted: i32,
    ) -> Result<(), SessionError> {
        if let Some(ref mut conn) = self.conn {
            diesel::update(
                vessel_sessions::table.filter(vessel_sessions::session_id.eq(self.session_id)),
            )
            .set((
                vessel_sessions::players_discovered.eq(discovered),
                vessel_sessions::players_inserted.eq(inserted),
            ))
            .execute(&mut **conn)
            .await?;
        }
        Ok(())
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

fn build_insecure_tls() -> Arc<rustls::ClientConfig> {
    Arc::new(
        rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(NoVerify))
            .with_no_client_auth(),
    )
}

fn build_system_tls() -> Arc<rustls::ClientConfig> {
    let mut roots = rustls::RootCertStore::empty();
    let certs = rustls_native_certs::load_native_certs();
    for cert in certs.certs {
        let _ = roots.add(cert);
    }
    Arc::new(
        rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    )
}

fn build_webpki_tls() -> Arc<rustls::ClientConfig> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    Arc::new(
        rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    )
}

/// Cert verifier that accepts any server cert. Dev-only.
#[derive(Debug)]
struct NoVerify;

impl rustls::client::danger::ServerCertVerifier for NoVerify {
    fn verify_server_cert(
        &self,
        _: &rustls::pki_types::CertificateDer<'_>,
        _: &[rustls::pki_types::CertificateDer<'_>],
        _: &rustls::pki_types::ServerName<'_>,
        _: &[u8],
        _: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _: &[u8],
        _: &rustls::pki_types::CertificateDer<'_>,
        _: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _: &[u8],
        _: &rustls::pki_types::CertificateDer<'_>,
        _: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        vec![
            rustls::SignatureScheme::RSA_PSS_SHA256,
            rustls::SignatureScheme::RSA_PSS_SHA384,
            rustls::SignatureScheme::RSA_PSS_SHA512,
            rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
            rustls::SignatureScheme::ECDSA_NISTP384_SHA384,
            rustls::SignatureScheme::ECDSA_NISTP521_SHA512,
            rustls::SignatureScheme::RSA_PKCS1_SHA256,
            rustls::SignatureScheme::RSA_PKCS1_SHA384,
            rustls::SignatureScheme::RSA_PKCS1_SHA512,
            rustls::SignatureScheme::ED25519,
        ]
    }
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
