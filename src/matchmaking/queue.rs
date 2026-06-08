//! Guild-wide queue matching and match formation.

use diesel_async::{AsyncConnection, AsyncPgConnection};

use crate::context::AppContext;
use crate::db::Game;
use crate::db::matchmaking_repos::{
    MATCH_STATUS_ACTIVE, MatchRepo, MatchmakingQueueRepo, QUEUE_STATUS_WAITING,
};
use crate::db::models::{
    MatchmakingQueue, NewMatch, NewMatchParticipant, NewMatchmakingQueue,
    NewMatchmakingQueueParticipant,
};
use crate::db::repos::now_ms;

use super::eligibility::{EligibilityContext, check_lobby_elo_gap};
use super::players::{LoadedPlayer, expected_lobby_cpr};
use super::{TeamPartition, partition_teams};

pub const QUEUE_EXPIRY_MS: i64 = 30 * 60 * 1000;

#[derive(Debug, Clone)]
pub struct FormedMatch {
    pub match_id: i32,
    pub partition: TeamPartition,
    pub players: Vec<LoadedPlayer>,
    pub stack_ids: Vec<i32>,
    pub expected_lobby_cpr: f64,
}

pub fn find_matching_stack_indices(
    stacks: &[MatchmakingQueue],
    lobby_size: i32,
) -> Option<Vec<usize>> {
    let n = stacks.len();
    if n == 0 {
        return None;
    }

    let target = lobby_size as usize;
    let limit = 1usize << n.min(16);

    for mask in 0..limit {
        let mut sum = 0usize;
        let mut indices = Vec::new();
        for (i, stack) in stacks.iter().enumerate().take(n) {
            if mask & (1usize << i) != 0 {
                sum += stack.player_count as usize;
                indices.push(i);
            }
        }
        if sum == target {
            return Some(indices);
        }
    }
    None
}

#[allow(clippy::too_many_arguments)]
pub async fn try_form_match(
    ctx: &AppContext,
    conn: &mut AsyncPgConnection,
    game: Game,
    guild_id: &str,
    channel_id: &str,
    created_by: &str,
    team_size: i32,
    eligibility: &EligibilityContext,
) -> Result<Option<FormedMatch>, String> {
    let stacks = MatchmakingQueueRepo::find_waiting_for_pool(conn, game, guild_id, team_size)
        .await
        .map_err(|e| format!("load stacks: {e}"))?;

    let lobby_size = team_size * 2;
    let max_gap = eligibility
        .rules
        .as_ref()
        .map(|r| r.max_elo_gap)
        .unwrap_or(500);

    let stack_ids: Vec<i32> = stacks.iter().map(|s| s.id).collect();
    let participants = MatchmakingQueueRepo::participants_for_queues(conn, &stack_ids)
        .await
        .map_err(|e| format!("load participants: {e}"))?;

    let Some(indices) = find_matching_stack_indices(&stacks, lobby_size) else {
        return Ok(None);
    };

    let selected_stacks: Vec<&MatchmakingQueue> = indices.iter().map(|&i| &stacks[i]).collect();
    let selected_ids: Vec<i32> = selected_stacks.iter().map(|s| s.id).collect();

    let mut discord_ids: Vec<String> = Vec::new();
    for stack in &selected_stacks {
        for p in participants.iter().filter(|p| p.queue_id == stack.id) {
            discord_ids.push(p.discord_user_id.clone());
        }
    }

    let players = super::players::load_players(ctx, conn, game, guild_id, &discord_ids).await?;
    let members: Vec<_> = players.iter().map(|p| p.member.clone()).collect();
    super::eligibility::check_queue_eligibility(
        conn,
        game,
        guild_id,
        &discord_ids,
        &members,
        eligibility,
    )
    .await?;
    check_lobby_elo_gap(&members, max_gap)?;

    let rated: Vec<_> = players.iter().map(|p| p.rated.clone()).collect();
    let partition = partition_teams(&rated, team_size as usize)
        .ok_or_else(|| "team partition failed".to_string())?;

    let lobby_cpr = expected_lobby_cpr(&players);
    let team_a_cpr: f64 = partition.team_a.iter().map(|&i| rated[i].cpr).sum();
    let team_b_cpr: f64 = partition.team_b.iter().map(|&i| rated[i].cpr).sum();
    let team_a_seed: f64 = partition
        .team_a
        .iter()
        .map(|&i| players[i].seeds.score)
        .sum();
    let team_b_seed: f64 = partition
        .team_b
        .iter()
        .map(|&i| players[i].seeds.score)
        .sum();

    let now = now_ms();
    let match_row = NewMatch {
        game,
        guild_id,
        channel_id,
        message_id: "pending",
        created_by_discord_user_id: created_by,
        status: MATCH_STATUS_ACTIVE,
        match_type: "internal",
        opponent_guild_id: None,
        opponent_channel_id: None,
        opponent_message_id: None,
        opponent_captain_discord_user_id: None,
        team_a_seed_total: team_a_seed,
        team_b_seed_total: team_b_seed,
        seed_gap: (team_a_seed - team_b_seed).abs(),
        winning_team: None,
        resolution_type: "played",
        team_a_balance_total: team_a_cpr,
        team_b_balance_total: team_b_cpr,
        balance_gap: partition.balance_gap,
        created_at: now,
        updated_at: now,
    };

    let players_owned = players.clone();
    let partition_owned = partition.clone();

    let formed = conn
        .transaction::<FormedMatch, diesel::result::Error, _>(async move |conn| {
            let mut parts = Vec::new();
            for (slot, &idx) in partition_owned.team_a.iter().enumerate() {
                let p = &players_owned[idx];
                parts.push(NewMatchParticipant {
                    game,
                    match_id: 0,
                    discord_user_id: &p.member.discord_user_id,
                    player_id: p.member.player_id,
                    team: "a",
                    slot: slot as i32,
                    seed_rank_points: p.seeds.rank_points,
                    seed_kd_ratio: p.seeds.kd_ratio,
                    seed_kost: p.seeds.kost,
                    seed_kpr: p.seeds.kpr,
                    seed_headshot_percentage: p.seeds.headshot_percentage,
                    seed_score: p.seeds.score,
                    balance_rating: p.rated.cpr,
                    kills: None,
                    deaths: None,
                    created_at: now,
                    updated_at: now,
                });
            }
            for (slot, &idx) in partition_owned.team_b.iter().enumerate() {
                let p = &players_owned[idx];
                parts.push(NewMatchParticipant {
                    game,
                    match_id: 0,
                    discord_user_id: &p.member.discord_user_id,
                    player_id: p.member.player_id,
                    team: "b",
                    slot: slot as i32,
                    seed_rank_points: p.seeds.rank_points,
                    seed_kd_ratio: p.seeds.kd_ratio,
                    seed_kost: p.seeds.kost,
                    seed_kpr: p.seeds.kpr,
                    seed_headshot_percentage: p.seeds.headshot_percentage,
                    seed_score: p.seeds.score,
                    balance_rating: p.rated.cpr,
                    kills: None,
                    deaths: None,
                    created_at: now,
                    updated_at: now,
                });
            }

            let (m, _) = MatchRepo::create(conn, match_row, parts).await?;

            MatchmakingQueueRepo::mark_matched(conn, &selected_ids, m.id).await?;

            Ok(FormedMatch {
                match_id: m.id,
                partition: partition_owned,
                players: players_owned,
                stack_ids: selected_ids,
                expected_lobby_cpr: lobby_cpr,
            })
        })
        .await
        .map_err(|e| format!("form match: {e}"))?;

    Ok(Some(formed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::MatchmakingQueue;

    #[test]
    fn finds_two_solo_stacks_for_1v1() {
        let stacks = vec![
            MatchmakingQueue {
                id: 1,
                game: Game::R6,
                guild_id: "g".into(),
                channel_id: "c".into(),
                captain_discord_user_id: "a".into(),
                status: QUEUE_STATUS_WAITING.into(),
                player_count: 1,
                stack_balance_total: 0.5,
                stack_balance_average: 0.5,
                matched_match_id: None,
                expires_at: 0,
                created_at: 0,
                updated_at: 0,
                team_size: 1,
            },
            MatchmakingQueue {
                id: 2,
                game: Game::R6,
                guild_id: "g".into(),
                channel_id: "c".into(),
                captain_discord_user_id: "b".into(),
                status: QUEUE_STATUS_WAITING.into(),
                player_count: 1,
                stack_balance_total: 0.5,
                stack_balance_average: 0.5,
                matched_match_id: None,
                expires_at: 0,
                created_at: 0,
                updated_at: 0,
                team_size: 1,
            },
        ];
        let indices = find_matching_stack_indices(&stacks, 2).expect("match");
        assert_eq!(indices.len(), 2);
    }
}

pub async fn create_stack(
    conn: &mut AsyncPgConnection,
    game: Game,
    guild_id: &str,
    channel_id: &str,
    captain_discord_user_id: &str,
    team_size: i32,
    players: &[LoadedPlayer],
) -> Result<
    (
        crate::db::models::MatchmakingQueue,
        Vec<crate::db::models::MatchmakingQueueParticipant>,
    ),
    String,
> {
    let now = now_ms();
    let stack_total: f64 = players.iter().map(|p| p.rated.cpr).sum();
    let stack_avg = if players.is_empty() {
        0.0
    } else {
        stack_total / players.len() as f64
    };

    let queue_row = NewMatchmakingQueue {
        game,
        guild_id,
        channel_id,
        captain_discord_user_id,
        status: QUEUE_STATUS_WAITING,
        player_count: players.len() as i32,
        stack_balance_total: stack_total,
        stack_balance_average: stack_avg,
        matched_match_id: None,
        expires_at: now + QUEUE_EXPIRY_MS,
        created_at: now,
        updated_at: now,
        team_size,
    };

    let participants: Vec<NewMatchmakingQueueParticipant> = players
        .iter()
        .enumerate()
        .map(|(slot, p)| NewMatchmakingQueueParticipant {
            game,
            queue_id: 0,
            discord_user_id: &p.member.discord_user_id,
            player_id: p.member.player_id,
            slot: slot as i32,
            username: &p.member.username,
            platform: &p.member.platform,
            balance_rating: p.rated.cpr,
            seed_rank_points: p.seeds.rank_points,
            seed_kd_ratio: p.seeds.kd_ratio,
            seed_kost: p.seeds.kost,
            seed_kpr: p.seeds.kpr,
            seed_headshot_percentage: p.seeds.headshot_percentage,
            seed_score: p.seeds.score,
            created_at: now,
            updated_at: now,
        })
        .collect();

    MatchmakingQueueRepo::create_stack(conn, queue_row, participants)
        .await
        .map_err(|e| format!("create stack: {e}"))
}

#[allow(clippy::too_many_arguments)]
pub async fn sweep_pool(
    ctx: &AppContext,
    conn: &mut AsyncPgConnection,
    game: Game,
    guild_id: &str,
    team_size: i32,
    channel_id: &str,
    created_by: &str,
    eligibility: &EligibilityContext,
) -> Result<Option<FormedMatch>, String> {
    try_form_match(
        ctx,
        conn,
        game,
        guild_id,
        channel_id,
        created_by,
        team_size,
        eligibility,
    )
    .await
}
