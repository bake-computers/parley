use clap::Parser;
use vessel::cli::{Command, VesselCli};
use vessel::progress::VesselProgress;
use vessel::thruster::{ThrusterOrchestrator, config_from_args};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = VesselCli::parse();

    let args = match &cli.command {
        Command::Thruster(args) => args,
        _ => anyhow::bail!("this example only supports the 'thruster' subcommand"),
    };

    let progress = VesselProgress::new();
    progress.multi.println(format!(
        "Thruster: targeting {} at {} TPS",
        args.target_url, args.tps
    ))?;

    let config =
        config_from_args(args).map_err(|e| anyhow::anyhow!("failed to build config: {e}"))?;
    let orchestrator = ThrusterOrchestrator::new(config)
        .map_err(|e| anyhow::anyhow!("orchestrator error: {e}"))?;

    let stats = orchestrator.run().await;

    progress.multi.println(format!(
        "Thruster complete: {} requests sent, {} errors, {:.1} actual TPS",
        stats.requests_sent, stats.errors, stats.actual_tps
    ))?;

    Ok(())
}
