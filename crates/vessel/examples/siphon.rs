use std::sync::Arc;

use clap::Parser;
use stats_scraper::fetch::{RetryPolicy, StatsClient, StatsPlatform};
use vessel::cli::{Command, VesselCli};
use vessel::hull::Hull;
use vessel::progress::VesselProgress;
use vessel::session::VesselSessionHandle;
use vessel::siphon::channel::{CrawlConfig, SiphonCommand};
use vessel::siphon::scraper_bridge::create_stats_fetcher;
use vessel::siphon::worker::SiphonWorker;

fn resolve_database_url(cli: &VesselCli) -> String {
    cli.database_url
        .clone()
        .or_else(|| std::env::var("DATABASE_URL").ok())
        .unwrap_or_else(|| "postgres://localhost:5432/vessel".to_string())
}

fn map_platform(platform: &vessel::cli::StatsPlatform) -> StatsPlatform {
    match platform {
        vessel::cli::StatsPlatform::Pc => StatsPlatform::Pc,
        vessel::cli::StatsPlatform::Xbox => StatsPlatform::Xbox,
        vessel::cli::StatsPlatform::Playstation => StatsPlatform::Playstation,
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = VesselCli::parse();

    let args = match &cli.command {
        Command::Siphon(args) => args,
        _ => anyhow::bail!("this example only supports the 'siphon' subcommand"),
    };

    let database_url = resolve_database_url(&cli);
    let progress = VesselProgress::new();

    let session = VesselSessionHandle::start(&database_url, &args.seed_player).await?;
    let session_id = session.session_id();
    progress
        .multi
        .println(format!("Session started: {session_id}"))?;

    let hull = Arc::new(Hull::default());
    let platform = map_platform(&args.platform);
    let client = Arc::new(StatsClient::default());
    let fetcher = create_stats_fetcher(client, platform);

    let config = CrawlConfig {
        max_depth: args.max_depth as usize,
        platform,
        channel_capacity: args.channel_capacity,
        rate_limit_per_second: 10,
        retry_policy: RetryPolicy::default(),
    };

    let worker_count = 4;
    let (mut joinset, tx, _shared_tx) =
        SiphonWorker::spawn_workers(worker_count, Arc::clone(&hull), config, fetcher);

    tx.send(SiphonCommand::Crawl {
        uid: args.seed_player.clone(),
        depth: 0,
    })
    .await?;

    for _ in 0..worker_count {
        tx.send(SiphonCommand::Terminate).await?;
    }
    drop(tx);

    let mut total_results = 0u64;
    let mut total_discovered = 0u64;
    while let Some(Ok(task_results)) = joinset.join_next().await {
        total_results += task_results.len() as u64;
        for r in &task_results {
            total_discovered += r.discovered_uids.len() as u64;
        }
        progress.discovery_rate.set_position(total_results);
        progress.active_syncs.set_position(total_discovered);
    }

    progress.multi.println(format!(
        "Siphon complete: {total_results} players processed, {total_discovered} UIDs discovered"
    ))?;

    session.complete().await?;
    Ok(())
}
