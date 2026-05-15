use std::path::PathBuf;

use clap::Parser;
use vessel::cli::{Command, VesselCli};
use vessel::progress::VesselProgress;
use vessel::purge::PurgeCommand;
use vessel::session::VesselSessionHandle;

fn resolve_database_url(cli: &VesselCli) -> String {
    cli.database_url
        .clone()
        .or_else(|| std::env::var("DATABASE_URL").ok())
        .unwrap_or_else(|| "postgres://localhost:5432/vessel".to_string())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = VesselCli::parse();

    let args = match &cli.command {
        Command::Purge(args) => args,
        _ => anyhow::bail!("this example only supports the 'purge' subcommand"),
    };

    let database_url = resolve_database_url(&cli);
    let bloom_path = PathBuf::from(&args.bloom_cache_path);
    let progress = VesselProgress::new();

    progress
        .multi
        .println(format!("Purging session: {}", args.session_id))?;
    progress
        .multi
        .println(format!("Bloom cache path: {}", bloom_path.display()))?;

    let session = VesselSessionHandle::start(&database_url, "purge-seed").await?;
    let session_id = session.session_id();
    progress
        .multi
        .println(format!("Started purge session: {session_id}"))?;

    PurgeCommand::run(session, &bloom_path).await?;

    progress.multi.println("Purge complete.")?;

    Ok(())
}
