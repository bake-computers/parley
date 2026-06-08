//! Load guild members with CPR/Glicko ratings and seed stats.

use std::collections::HashMap;

use diesel_async::AsyncPgConnection;

use crate::context::AppContext;
use crate::db::Game;
use crate::db::models::PlayerStatSnapshot;
use crate::db::repos::{GuildMemberRow, GuildMembershipRepo, PlayerStatSnapshotRepo};

use super::{PlayerMatchStats, PopulationNorms, RatedPlayer, RawPlayerStats, calculate_cpr};

#[derive(Debug, Clone)]
pub struct PlayerSeedData {
    pub rank_points: i32,
    pub kd_ratio: f64,
    pub kost: f64,
    pub kpr: f64,
    pub headshot_percentage: f64,
    pub score: f64,
}

#[derive(Debug, Clone)]
pub struct LoadedPlayer {
    pub member: GuildMemberRow,
    pub rated: RatedPlayer,
    pub seeds: PlayerSeedData,
}

fn snapshot_metadata_f64(meta: &Option<serde_json::Value>, key: &str) -> f64 {
    meta.as_ref()
        .and_then(|v| v.get(key))
        .and_then(|v| v.as_f64().or_else(|| v.as_i64().map(|n| n as f64)))
        .unwrap_or(0.0)
}

pub fn raw_stats_from_snapshot(snap: &PlayerStatSnapshot) -> RawPlayerStats {
    let rounds = snapshot_metadata_f64(&snap.metadata, "rounds_played");
    let survival_rounds = snapshot_metadata_f64(&snap.metadata, "survival_rounds");
    let kpr = if rounds > 0.0 {
        snap.kills as f64 / rounds
    } else {
        0.0
    };
    let survival_rate = if rounds > 0.0 {
        survival_rounds / rounds * 100.0
    } else {
        0.0
    };

    RawPlayerStats {
        kd: snap.kd_ratio,
        win_rate: snap.win_rate,
        kpr,
        mmr: snap.rank_points as f64,
        kost: snap.kost,
        survival_rate,
        hs_percentage: snap.headshot_percentage,
        tk_penalty: 0.0,
    }
}

pub fn seeds_from_snapshot(snap: &PlayerStatSnapshot) -> PlayerSeedData {
    let rounds = snapshot_metadata_f64(&snap.metadata, "rounds_played");
    let kpr = if rounds > 0.0 {
        snap.kills as f64 / rounds
    } else {
        0.0
    };
    PlayerSeedData {
        rank_points: snap.rank_points,
        kd_ratio: snap.kd_ratio,
        kost: snap.kost,
        kpr,
        headshot_percentage: snap.headshot_percentage,
        score: snap.rank_points as f64,
    }
}

pub async fn compute_norms(
    ctx: &AppContext,
    conn: &mut AsyncPgConnection,
    game: Game,
    guild_id: &str,
) -> PopulationNorms {
    if let Some(cache) = &ctx.guild_cache
        && let Some(norms) = cache.get_norms(game, guild_id).await
    {
        return norms;
    }

    let members = GuildMembershipRepo::list_for_guild(conn, game, guild_id)
        .await
        .unwrap_or_default();
    let player_ids: Vec<i32> = members.iter().map(|m| m.player_id).collect();
    let snapshots = PlayerStatSnapshotRepo::latest_for_players(conn, game, &player_ids)
        .await
        .unwrap_or_default();

    let samples: Vec<RawPlayerStats> = snapshots.iter().map(raw_stats_from_snapshot).collect();
    let norms = PopulationNorms::from_samples(&samples);

    if let Some(cache) = &ctx.guild_cache {
        cache.set_norms(game, guild_id, norms).await;
    }

    norms
}

pub async fn load_players(
    ctx: &AppContext,
    conn: &mut AsyncPgConnection,
    game: Game,
    guild_id: &str,
    discord_user_ids: &[String],
) -> Result<Vec<LoadedPlayer>, String> {
    if discord_user_ids.is_empty() {
        return Err("discord_user_ids must not be empty".into());
    }

    let unique: std::collections::HashSet<_> = discord_user_ids.iter().collect();
    if unique.len() != discord_user_ids.len() {
        return Err("duplicate discord_user_ids".into());
    }

    let members =
        GuildMembershipRepo::find_many_by_discord_ids(conn, game, guild_id, discord_user_ids)
            .await
            .map_err(|e| format!("load memberships: {e}"))?;

    if members.len() != discord_user_ids.len() {
        return Err("one or more discord_user_ids are not registered in this guild".into());
    }

    let norms = compute_norms(ctx, conn, game, guild_id).await;
    let player_ids: Vec<i32> = members.iter().map(|m| m.player_id).collect();
    let snapshots = PlayerStatSnapshotRepo::latest_for_players(conn, game, &player_ids)
        .await
        .unwrap_or_default();
    let snap_by_player: HashMap<i32, &PlayerStatSnapshot> =
        snapshots.iter().map(|s| (s.player_id, s)).collect();

    let order: HashMap<&str, usize> = discord_user_ids
        .iter()
        .enumerate()
        .map(|(i, id)| (id.as_str(), i))
        .collect();

    let mut loaded: Vec<LoadedPlayer> = members
        .into_iter()
        .map(|m| {
            let snap = snap_by_player.get(&m.player_id);
            let match_stats = snap
                .map(|s| PlayerMatchStats::from_raw(raw_stats_from_snapshot(s), &norms))
                .unwrap_or_else(PlayerMatchStats::neutral);
            let cpr = calculate_cpr(&match_stats);
            let seeds = snap
                .map(|s| seeds_from_snapshot(s))
                .unwrap_or(PlayerSeedData {
                    rank_points: 0,
                    kd_ratio: 0.0,
                    kost: 0.0,
                    kpr: 0.0,
                    headshot_percentage: 0.0,
                    score: 0.0,
                });
            LoadedPlayer {
                rated: RatedPlayer {
                    mu: m.internal_elo,
                    phi: m.rating_deviation,
                    cpr,
                },
                seeds,
                member: m,
            }
        })
        .collect();

    loaded.sort_by_key(|p| {
        order
            .get(p.member.discord_user_id.as_str())
            .copied()
            .unwrap_or(0)
    });
    Ok(loaded)
}

pub fn expected_lobby_cpr(players: &[LoadedPlayer]) -> f64 {
    if players.is_empty() {
        return 0.0;
    }
    players.iter().map(|p| p.rated.cpr).sum::<f64>() / players.len() as f64
}
