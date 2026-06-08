//! `parley` binary entry point.

#[cfg(feature = "mimalloc")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

use std::net::SocketAddr;

mod backends;
mod cache_redis;
mod cache_store;
mod connect;
mod context;
mod db;
mod fetch;
mod guild_cache;
mod handlers;
mod leaderboard;
mod logging;
mod matchmaking;
mod nuxt;
mod proto;
mod schema;
mod scrape;
mod stats_metrics;
mod stats_persist;
mod stats_proto;
mod tourney;

use context::AppContext;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load `.env` (if present) BEFORE tracing_subscriber / AppContext read env
    // vars. Missing `.env` is not an error; deploys set env directly.
    match dotenvy::dotenv() {
        Ok(path) => eprintln!("loaded env from {}", path.display()),
        Err(dotenvy::Error::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => {
            // No .env; that's fine.
        }
        Err(e) => eprintln!("warning: failed to load .env: {e}"),
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "parley=info,tower_http=info".into()),
        )
        .init();

    let addr: SocketAddr = std::env::var("ENGINE_SERVICE_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:50051".into())
        .parse()?;

    let axiom_logger = logging::AxiomLogger::new(logging::AxiomConfig::default());
    let axiom_for_shutdown = axiom_logger.clone();
    let ctx = AppContext::from_env(axiom_logger).await?;
    if let Some(ref pool) = ctx.pool {
        matchmaking::sweeper::spawn(std::sync::Arc::new(pool.clone()), ctx.clone());
    }
    let app = connect::build_router_with_context(ctx);
    tracing::info!(%addr, "engine-service listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;

    let shutdown_signal = async {
        tokio::signal::ctrl_c().await.ok();
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    axiom_for_shutdown.shutdown();
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    Ok(())
}
