//! `parley` binary entry point.

#[cfg(feature = "mimalloc")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

use std::net::SocketAddr;

mod backends;
mod cache;
mod cache_store;
mod connect;
mod context;
mod db;
mod fetch;
mod handlers;
mod logging;
mod nuxt;
mod proto;
mod scrape;
mod stats_metrics;
mod stats_proto;

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
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "engine_service=info,brawl_stars=debug,stats_scraper=info,tower_http=info,parley=info,ocr=debug".into()
            }),
        )
        .init();

    let addr: SocketAddr = std::env::var("ENGINE_SERVICE_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:50051".into())
        .parse()?;

    let axiom_logger = logging::AxiomLogger::new(logging::AxiomConfig::default());
    let ctx = AppContext::from_env(axiom_logger).await?;
    let app = connect::build_router_with_context(ctx);
    tracing::info!(%addr, "engine-service listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
