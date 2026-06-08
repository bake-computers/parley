//! Background queue expiry and match retry.

use std::sync::Arc;
use std::time::Duration;

use diesel::prelude::*;
use diesel_async::RunQueryDsl;

use crate::context::AppContext;
use crate::db::Game;
use crate::db::matchmaking_repos::{MatchmakingQueueRepo, QUEUE_STATUS_WAITING};
use crate::db::pool::DbPool;
use crate::db::repos::now_ms;
use crate::db::schema::matchmaking_queues;
use crate::matchmaking::eligibility::load_eligibility;
use crate::matchmaking::queue::sweep_pool;

pub fn spawn(pool: Arc<DbPool>, ctx: AppContext) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            if let Err(e) = run_once(&pool, &ctx).await {
                tracing::warn!(error = %e, "queue sweeper tick failed");
            }
        }
    });
}

async fn run_once(pool: &DbPool, ctx: &AppContext) -> Result<(), String> {
    let mut conn = pool.get().await.map_err(|e| format!("pool: {e}"))?;
    let now = now_ms();
    MatchmakingQueueRepo::expire_stale(&mut conn, now)
        .await
        .map_err(|e| format!("expire: {e}"))?;

    let pools: Vec<(Game, String, i32)> = matchmaking_queues::table
        .filter(matchmaking_queues::status.eq(QUEUE_STATUS_WAITING))
        .select((
            matchmaking_queues::game,
            matchmaking_queues::guild_id,
            matchmaking_queues::team_size,
        ))
        .distinct()
        .load(&mut conn)
        .await
        .map_err(|e| format!("list pools: {e}"))?;

    for (game, guild_id, team_size) in pools {
        let eligibility = load_eligibility(&mut conn, game, &guild_id).await?;
        let _ = sweep_pool(
            ctx,
            &mut conn,
            game,
            &guild_id,
            team_size,
            "",
            "sweeper",
            &eligibility,
        )
        .await?;
    }

    Ok(())
}
