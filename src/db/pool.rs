//! Async Postgres connection pool (bb8 + diesel-async) with TLS.
//!
//! `DATABASE_URL` is required to build a pool. All pool tunables are
//! environment-overridable so operators can scale without recompiling:
//!
//!   * `DB_POOL_MAX`              — max connections in the pool (default 32).
//!   * `DB_POOL_MIN_IDLE`         — minimum idle connections (default 4).
//!   * `DB_CONNECTION_TIMEOUT_MS` — max wait to acquire a connection in ms
//!                                  (default 3000).
//!   * `DB_IDLE_TIMEOUT_S`        — reap idle connections after this many s
//!                                  (default 600).
//!   * `DB_TLS`                   — TLS mode (default `system`):
//!       - `system`           — rustls with OS trust store (works for managed
//!                               DB providers like Neon/RDS/Supabase).
//!       - `webpki`           — rustls with bundled WebPKI roots.
//!       - `accept-invalid`   — rustls, but skips cert verification. Use only
//!                               for self-signed dev servers.
//!       - `none` or `disable`— plain connection, no TLS (default tokio-postgres).
//!
//! Set `RUN_MIGRATIONS=1` at boot to apply embedded migrations before serving.

use std::sync::Arc;
use std::time::Duration;

use crate::db::MIGRATIONS;
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::pooled_connection::{AsyncDieselConnectionManager, ManagerConfig};
use futures_util::FutureExt;
use futures_util::future::BoxFuture;

/// Production alias — prefer this in handler signatures.
pub type DbPool = Pool<AsyncPgConnection>;

/// Configuration resolved from process env.
#[derive(Debug, Clone)]
pub struct PoolConfig {
    pub database_url: String,
    pub max_size: u32,
    pub min_idle: Option<u32>,
    pub connection_timeout: Duration,
    pub idle_timeout: Option<Duration>,
    pub tls_mode: TlsMode,
    /// Optional path to a PEM file containing one or more CA certificates to
    /// add to the trust store. Read once at pool construction.
    pub tls_ca_file: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TlsMode {
    /// rustls + OS trust store (`rustls-native-certs`). Default.
    System,
    /// rustls + bundled WebPKI roots.
    Webpki,
    /// rustls with no cert verification. Dev-only.
    AcceptInvalid,
    /// No TLS.
    Disabled,
}

impl PoolConfig {
    /// Read configuration from env; returns `None` when `DATABASE_URL` is
    /// unset so the caller can decide whether to start in DB-less mode.
    pub fn from_env() -> Option<Self> {
        let database_url = std::env::var("DATABASE_URL").ok()?;
        let max_size = read_u32("DB_POOL_MAX", 32);
        let min_idle = Some(read_u32("DB_POOL_MIN_IDLE", 4));
        let connection_timeout = Duration::from_millis(read_u64("DB_CONNECTION_TIMEOUT_MS", 3000));
        let idle_timeout = match read_u64("DB_IDLE_TIMEOUT_S", 600) {
            0 => None,
            n => Some(Duration::from_secs(n)),
        };
        let tls_mode = match std::env::var("DB_TLS").as_deref().unwrap_or("system") {
            "system" | "" => TlsMode::System,
            "webpki" => TlsMode::Webpki,
            "accept-invalid" | "insecure" => TlsMode::AcceptInvalid,
            "none" | "disable" | "off" => TlsMode::Disabled,
            other => {
                tracing::warn!(
                    mode = %other,
                    "unknown DB_TLS value; falling back to system"
                );
                TlsMode::System
            }
        };
        Some(Self {
            database_url,
            max_size,
            min_idle,
            connection_timeout,
            idle_timeout,
            tls_mode,
            tls_ca_file: std::env::var("DB_TLS_CA_FILE")
                .ok()
                .filter(|s| !s.is_empty()),
        })
    }
}

fn read_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn read_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// Build an async Postgres pool. Fails fast if the DB is unreachable.
pub async fn init_pool(cfg: &PoolConfig) -> anyhow::Result<DbPool> {
    // Install the default crypto provider once per process. Ignored if
    // already installed.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let mut mgr_config = ManagerConfig::<AsyncPgConnection>::default();
    mgr_config.custom_setup = match cfg.tls_mode {
        TlsMode::Disabled => Box::new(|url: &str| plain_setup(url.to_string()).boxed()),
        mode => {
            let tls_config = Arc::new(build_tls_config(mode, cfg.tls_ca_file.as_deref())?);
            Box::new(move |url: &str| {
                let tls = tls_config.clone();
                let owned = url.to_string();
                rustls_setup(owned, tls).boxed()
            })
        }
    };

    let manager = AsyncDieselConnectionManager::<AsyncPgConnection>::new_with_config(
        cfg.database_url.clone(),
        mgr_config,
    );

    let mut builder = Pool::builder()
        .max_size(cfg.max_size)
        .connection_timeout(cfg.connection_timeout);
    if let Some(min_idle) = cfg.min_idle {
        builder = builder.min_idle(Some(min_idle));
    }
    if let Some(idle_timeout) = cfg.idle_timeout {
        builder = builder.idle_timeout(Some(idle_timeout));
    }
    let pool = builder
        .build(manager)
        .await
        .map_err(|e| anyhow::anyhow!("failed to build DB pool: {e}"))?;
    Ok(pool)
}

fn build_tls_config(mode: TlsMode, ca_file: Option<&str>) -> anyhow::Result<rustls::ClientConfig> {
    use rustls::ClientConfig;

    let cfg = match mode {
        TlsMode::System => {
            let mut roots = rustls::RootCertStore::empty();
            let certs = rustls_native_certs::load_native_certs();
            for err in &certs.errors {
                tracing::warn!(error = %err, "native cert loader warning");
            }
            for cert in certs.certs {
                if let Err(e) = roots.add(cert) {
                    tracing::warn!(error = %e, "skipped invalid native cert");
                }
            }
            if let Some(path) = ca_file {
                load_ca_pem(path, &mut roots)?;
            }
            ClientConfig::builder()
                .with_root_certificates(roots)
                .with_no_client_auth()
        }
        TlsMode::Webpki => {
            let mut roots = rustls::RootCertStore::empty();
            roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
            if let Some(path) = ca_file {
                load_ca_pem(path, &mut roots)?;
            }
            ClientConfig::builder()
                .with_root_certificates(roots)
                .with_no_client_auth()
        }
        TlsMode::AcceptInvalid => ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(NoVerify))
            .with_no_client_auth(),
        TlsMode::Disabled => unreachable!(),
    };
    Ok(cfg)
}

fn load_ca_pem(path: &str, roots: &mut rustls::RootCertStore) -> anyhow::Result<()> {
    use std::fs::File;
    use std::io::BufReader;
    let file =
        File::open(path).map_err(|e| anyhow::anyhow!("opening DB_TLS_CA_FILE at {path}: {e}"))?;
    let mut reader = BufReader::new(file);
    let mut added = 0usize;
    for result in rustls_pemfile::certs(&mut reader) {
        let der = result.map_err(|e| anyhow::anyhow!("parsing CA cert: {e}"))?;
        roots
            .add(der)
            .map_err(|e| anyhow::anyhow!("trusting CA cert: {e}"))?;
        added += 1;
    }
    if added == 0 {
        anyhow::bail!("no certificates found in {path}");
    }
    tracing::info!(path = %path, count = added, "loaded extra CA certs");
    Ok(())
}

async fn rustls_setup(
    url: String,
    tls_config: Arc<rustls::ClientConfig>,
) -> diesel::ConnectionResult<AsyncPgConnection> {
    let tls = tokio_postgres_rustls::MakeRustlsConnect::new((*tls_config).clone());
    let (client, connection) = tokio_postgres::connect(&url, tls)
        .await
        .map_err(|e| diesel::ConnectionError::BadConnection(format!("pg connect: {e}")))?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            tracing::warn!(error = %e, "postgres connection task ended");
        }
    });
    AsyncPgConnection::try_from(client).await
}

async fn plain_setup(url: String) -> diesel::ConnectionResult<AsyncPgConnection> {
    let (client, connection) = tokio_postgres::connect(&url, tokio_postgres::NoTls)
        .await
        .map_err(|e| diesel::ConnectionError::BadConnection(format!("pg connect: {e}")))?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            tracing::warn!(error = %e, "postgres connection task ended");
        }
    });
    AsyncPgConnection::try_from(client).await
}

/// Apply embedded migrations. This opens a **sync** connection because
/// diesel_migrations is sync-only today; we briefly go off-runtime via
/// `tokio::task::spawn_blocking` so the async runtime isn't blocked.
///
/// Only runs when `RUN_MIGRATIONS=1`.
pub async fn run_migrations_if_requested(cfg: &PoolConfig) -> anyhow::Result<()> {
    if std::env::var("RUN_MIGRATIONS").ok().as_deref() != Some("1") {
        return Ok(());
    }
    let url = cfg.database_url.clone();
    tokio::task::spawn_blocking(move || {
        use diesel::prelude::*;
        use diesel_migrations::MigrationHarness;
        let mut conn = diesel::pg::PgConnection::establish(&url)
            .map_err(|e| anyhow::anyhow!("migrations connect failed: {e}"))?;
        conn.run_pending_migrations(MIGRATIONS)
            .map_err(|e| anyhow::anyhow!("run_pending_migrations failed: {e}"))?;
        Ok::<_, anyhow::Error>(())
    })
    .await??;
    tracing::info!("db migrations applied");
    Ok(())
}

/// Tiny health check that proves the pool can hand out a connection and the
/// connection can round-trip a trivial query.
pub async fn ping(pool: &DbPool) -> anyhow::Result<()> {
    use diesel::sql_query;
    use diesel_async::RunQueryDsl;
    let mut conn = pool.get().await?;
    sql_query("SELECT 1").execute(&mut conn).await?;
    Ok(())
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

// Suppress unused-import warning in tests that only touch PoolConfig.
#[allow(unused_imports)]
use futures_util as _futures_util_keep;

#[allow(unused_imports)]
type _BoxFutureKeep = BoxFuture<'static, diesel::ConnectionResult<AsyncPgConnection>>;
