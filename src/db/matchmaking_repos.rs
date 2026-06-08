//! Repositories for matchmaking queues and scrim matches.

use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::db::Game;
use crate::db::models::{
    MatchParticipant, MatchRow, MatchmakingQueue, MatchmakingQueueParticipant, NewMatch,
    NewMatchParticipant, NewMatchmakingQueue, NewMatchmakingQueueParticipant,
};
use crate::db::repos::now_ms;
use crate::db::schema::{
    match_participants, matches, matchmaking_queue_participants, matchmaking_queues,
};

pub const QUEUE_STATUS_WAITING: &str = "waiting";
pub const QUEUE_STATUS_MATCHED: &str = "matched";
pub const QUEUE_STATUS_CANCELLED: &str = "cancelled";
pub const QUEUE_STATUS_EXPIRED: &str = "expired";

pub const MATCH_STATUS_PENDING: &str = "pending";
pub const MATCH_STATUS_ACTIVE: &str = "active";
pub const MATCH_STATUS_COMPLETED: &str = "completed";

pub struct MatchmakingQueueRepo;

impl MatchmakingQueueRepo {
    pub async fn create_stack(
        conn: &mut AsyncPgConnection,
        row: NewMatchmakingQueue<'_>,
        participants: Vec<NewMatchmakingQueueParticipant<'_>>,
    ) -> QueryResult<(MatchmakingQueue, Vec<MatchmakingQueueParticipant>)> {
        let queue = diesel::insert_into(matchmaking_queues::table)
            .values(&row)
            .returning(MatchmakingQueue::as_returning())
            .get_result(conn)
            .await?;

        let mut saved = Vec::with_capacity(participants.len());
        for mut p in participants {
            p.queue_id = queue.id;
            let part = diesel::insert_into(matchmaking_queue_participants::table)
                .values(&p)
                .returning(MatchmakingQueueParticipant::as_returning())
                .get_result(conn)
                .await?;
            saved.push(part);
        }
        Ok((queue, saved))
    }

    pub async fn find_waiting_for_pool(
        conn: &mut AsyncPgConnection,
        game: Game,
        guild_id: &str,
        team_size: i32,
    ) -> QueryResult<Vec<MatchmakingQueue>> {
        matchmaking_queues::table
            .filter(matchmaking_queues::game.eq(game))
            .filter(matchmaking_queues::guild_id.eq(guild_id))
            .filter(matchmaking_queues::team_size.eq(team_size))
            .filter(matchmaking_queues::status.eq(QUEUE_STATUS_WAITING))
            .order(matchmaking_queues::created_at.asc())
            .select(MatchmakingQueue::as_select())
            .load(conn)
            .await
    }

    pub async fn participants_for_queues(
        conn: &mut AsyncPgConnection,
        queue_ids: &[i32],
    ) -> QueryResult<Vec<MatchmakingQueueParticipant>> {
        if queue_ids.is_empty() {
            return Ok(Vec::new());
        }
        matchmaking_queue_participants::table
            .filter(matchmaking_queue_participants::queue_id.eq_any(queue_ids))
            .order((
                matchmaking_queue_participants::queue_id.asc(),
                matchmaking_queue_participants::slot.asc(),
            ))
            .select(MatchmakingQueueParticipant::as_select())
            .load(conn)
            .await
    }

    pub async fn find_active_for_captain(
        conn: &mut AsyncPgConnection,
        game: Game,
        captain_discord_user_id: &str,
    ) -> QueryResult<Option<MatchmakingQueue>> {
        matchmaking_queues::table
            .filter(matchmaking_queues::game.eq(game))
            .filter(matchmaking_queues::captain_discord_user_id.eq(captain_discord_user_id))
            .filter(matchmaking_queues::status.eq(QUEUE_STATUS_WAITING))
            .select(MatchmakingQueue::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn find_active_for_participant(
        conn: &mut AsyncPgConnection,
        game: Game,
        discord_user_id: &str,
    ) -> QueryResult<Option<MatchmakingQueue>> {
        let queue_id: Option<i32> = matchmaking_queue_participants::table
            .filter(matchmaking_queue_participants::game.eq(game))
            .filter(matchmaking_queue_participants::discord_user_id.eq(discord_user_id))
            .inner_join(matchmaking_queues::table)
            .filter(matchmaking_queues::status.eq(QUEUE_STATUS_WAITING))
            .select(matchmaking_queues::id)
            .first(conn)
            .await
            .optional()?;

        let Some(id) = queue_id else {
            return Ok(None);
        };
        matchmaking_queues::table
            .find(id)
            .select(MatchmakingQueue::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn mark_matched(
        conn: &mut AsyncPgConnection,
        queue_ids: &[i32],
        match_id: i32,
    ) -> QueryResult<usize> {
        let now = now_ms();
        diesel::update(
            matchmaking_queues::table
                .filter(matchmaking_queues::id.eq_any(queue_ids))
                .filter(matchmaking_queues::status.eq(QUEUE_STATUS_WAITING)),
        )
        .set((
            matchmaking_queues::status.eq(QUEUE_STATUS_MATCHED),
            matchmaking_queues::matched_match_id.eq(Some(match_id)),
            matchmaking_queues::updated_at.eq(now),
        ))
        .execute(conn)
        .await
    }

    pub async fn cancel(
        conn: &mut AsyncPgConnection,
        queue_id: i32,
    ) -> QueryResult<Option<MatchmakingQueue>> {
        let now = now_ms();
        diesel::update(
            matchmaking_queues::table
                .filter(matchmaking_queues::id.eq(queue_id))
                .filter(matchmaking_queues::status.eq(QUEUE_STATUS_WAITING)),
        )
        .set((
            matchmaking_queues::status.eq(QUEUE_STATUS_CANCELLED),
            matchmaking_queues::updated_at.eq(now),
        ))
        .returning(MatchmakingQueue::as_returning())
        .get_result(conn)
        .await
        .optional()
    }

    pub async fn expire_stale(conn: &mut AsyncPgConnection, now: i64) -> QueryResult<usize> {
        diesel::update(
            matchmaking_queues::table
                .filter(matchmaking_queues::status.eq(QUEUE_STATUS_WAITING))
                .filter(matchmaking_queues::expires_at.lt(now)),
        )
        .set((
            matchmaking_queues::status.eq(QUEUE_STATUS_EXPIRED),
            matchmaking_queues::updated_at.eq(now),
        ))
        .execute(conn)
        .await
    }

    pub async fn pool_stats(
        conn: &mut AsyncPgConnection,
        game: Game,
        guild_id: &str,
        team_size: i32,
    ) -> QueryResult<(i32, i32)> {
        let stacks: Vec<i32> = matchmaking_queues::table
            .filter(matchmaking_queues::game.eq(game))
            .filter(matchmaking_queues::guild_id.eq(guild_id))
            .filter(matchmaking_queues::team_size.eq(team_size))
            .filter(matchmaking_queues::status.eq(QUEUE_STATUS_WAITING))
            .select(matchmaking_queues::player_count)
            .load(conn)
            .await?;
        let waiting_players: i32 = stacks.iter().sum();
        Ok((waiting_players, stacks.len() as i32))
    }
}

pub struct MatchRepo;

impl MatchRepo {
    pub async fn create(
        conn: &mut AsyncPgConnection,
        row: NewMatch<'_>,
        participants: Vec<NewMatchParticipant<'_>>,
    ) -> QueryResult<(MatchRow, Vec<MatchParticipant>)> {
        let m = diesel::insert_into(matches::table)
            .values(&row)
            .returning(MatchRow::as_returning())
            .get_result(conn)
            .await?;

        let mut saved = Vec::with_capacity(participants.len());
        for mut p in participants {
            p.match_id = m.id;
            let part = diesel::insert_into(match_participants::table)
                .values(&p)
                .returning(MatchParticipant::as_returning())
                .get_result(conn)
                .await?;
            saved.push(part);
        }
        Ok((m, saved))
    }

    pub async fn get(
        conn: &mut AsyncPgConnection,
        game: Game,
        match_id: i32,
    ) -> QueryResult<Option<MatchRow>> {
        matches::table
            .filter(matches::id.eq(match_id))
            .filter(matches::game.eq(game))
            .select(MatchRow::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn participants(
        conn: &mut AsyncPgConnection,
        match_id: i32,
    ) -> QueryResult<Vec<MatchParticipant>> {
        match_participants::table
            .filter(match_participants::match_id.eq(match_id))
            .order((
                match_participants::team.asc(),
                match_participants::slot.asc(),
            ))
            .select(MatchParticipant::as_select())
            .load(conn)
            .await
    }

    pub async fn complete(
        conn: &mut AsyncPgConnection,
        game: Game,
        match_id: i32,
        winning_team: &str,
    ) -> QueryResult<Option<MatchRow>> {
        let now = now_ms();
        diesel::update(
            matches::table
                .filter(matches::id.eq(match_id))
                .filter(matches::game.eq(game)),
        )
        .set((
            matches::status.eq(MATCH_STATUS_COMPLETED),
            matches::winning_team.eq(Some(winning_team)),
            matches::updated_at.eq(now),
        ))
        .returning(MatchRow::as_returning())
        .get_result(conn)
        .await
        .optional()
    }

    pub async fn count_today_for_guild(
        conn: &mut AsyncPgConnection,
        game: Game,
        guild_id: &str,
    ) -> QueryResult<i64> {
        let start_of_day = {
            let now = chrono::Utc::now();
            now.date_naive()
                .and_hms_opt(0, 0, 0)
                .map(|dt| dt.and_utc().timestamp_millis())
                .unwrap_or(0)
        };
        let count: i64 = matches::table
            .filter(matches::game.eq(game))
            .filter(matches::guild_id.eq(guild_id))
            .filter(matches::created_at.ge(start_of_day))
            .count()
            .get_result(conn)
            .await?;
        Ok(count)
    }
}
