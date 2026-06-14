//! Repositories for matchmaking queues and scrim matches.

use base64::Engine as _;
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::db::Game;
use crate::db::models::{
    MatchParticipant, MatchParticipantWithUsername, MatchRow, MatchmakingQueue,
    MatchmakingQueueParticipant, NewMatch, NewMatchParticipant, NewMatchmakingQueue,
    NewMatchmakingQueueParticipant,
};
use crate::db::repos::now_ms;
use crate::db::schema::{
    match_participants, matches, matchmaking_queue_participants, matchmaking_queues, players,
};

/// Errors produced when decoding an opaque pagination cursor.
#[derive(Debug, Error)]
pub enum CursorError {
    #[error("cursor base64 decode failed: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("cursor JSON parse failed: {0}")]
    Json(#[from] serde_json::Error),
}

/// Wire payload for a keyset-pagination cursor.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CursorPayload {
    created_at: i64,
    id: i32,
}

pub fn encode_cursor(created_at: i64, id: i32) -> String {
    let payload = CursorPayload { created_at, id };
    let json = serde_json::to_vec(&payload).expect("CursorPayload serialization cannot fail");
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json)
}

pub fn decode_cursor(s: &str) -> Result<Option<(i64, i32)>, CursorError> {
    if s.is_empty() {
        return Ok(None);
    }
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s)?;
    let payload: CursorPayload = serde_json::from_slice(&bytes)?;
    Ok(Some((payload.created_at, payload.id)))
}

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
    ) -> QueryResult<Vec<MatchParticipantWithUsername>> {
        match_participants::table
            .left_join(players::table.on(match_participants::player_id.eq(players::id)))
            .filter(match_participants::match_id.eq(match_id))
            .order((
                match_participants::team.asc(),
                match_participants::slot.asc(),
            ))
            .select((
                match_participants::id,
                match_participants::game,
                match_participants::match_id,
                match_participants::discord_user_id,
                match_participants::player_id,
                match_participants::team,
                match_participants::slot,
                match_participants::seed_rank_points,
                match_participants::seed_kd_ratio,
                match_participants::seed_kost,
                match_participants::seed_kpr,
                match_participants::seed_headshot_percentage,
                match_participants::seed_score,
                match_participants::balance_rating,
                match_participants::kills,
                match_participants::deaths,
                match_participants::created_at,
                match_participants::updated_at,
                players::username.nullable(),
                players::platform.nullable(),
            ))
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

    /// Keyset-paginated list of matches for a guild, newest first.
    ///
    /// `cursor` is the `(created_at, id)` of the last row from the previous
    /// page (`None` for the first page). Rows are ordered
    /// `(created_at DESC, id DESC)`; the next page starts strictly *after*
    /// the cursor — `(created_at, id) < (cursor.0, cursor.1)`.
    pub async fn list_for_guild(
        conn: &mut AsyncPgConnection,
        game: Game,
        guild_id: &str,
        limit: i64,
        cursor: Option<(i64, i32)>,
    ) -> QueryResult<Vec<MatchRow>> {
        let mut q = matches::table
            .filter(matches::game.eq(game))
            .filter(matches::guild_id.eq(guild_id))
            .order((matches::created_at.desc(), matches::id.desc()))
            .limit(limit)
            .into_boxed();
        if let Some((c_ts, c_id)) = cursor {
            q = q.filter(
                matches::created_at
                    .lt(c_ts)
                    .or(matches::created_at.eq(c_ts).and(matches::id.lt(c_id))),
            );
        }
        q.select(MatchRow::as_select()).load(conn).await
    }

    /// Keyset-paginated list of matches a user participated in, newest first.
    ///
    /// `cursor` follows the same `(created_at, id)` shape as
    /// [`Self::list_for_guild`]. The `match_participants_match_user_unique`
    /// index on `(match_id, discord_user_id)` guarantees at most one
    /// participant row per `(match, user)`, so the inner join cannot
    /// produce duplicate match rows and no `DISTINCT` is required.
    pub async fn list_for_user(
        conn: &mut AsyncPgConnection,
        game: Game,
        discord_user_id: &str,
        limit: i64,
        cursor: Option<(i64, i32)>,
    ) -> QueryResult<Vec<MatchRow>> {
        let mut q = matches::table
            .inner_join(match_participants::table.on(match_participants::match_id.eq(matches::id)))
            .filter(match_participants::game.eq(game))
            .filter(match_participants::discord_user_id.eq(discord_user_id))
            .order((matches::created_at.desc(), matches::id.desc()))
            .limit(limit)
            .into_boxed();
        if let Some((c_ts, c_id)) = cursor {
            q = q.filter(
                matches::created_at
                    .lt(c_ts)
                    .or(matches::created_at.eq(c_ts).and(matches::id.lt(c_id))),
            );
        }
        q.select(MatchRow::as_select()).load(conn).await
    }

    /// Look up a single match by its public UUID (used by the bridge KV
    /// read-through). Returns `Ok(None)` if no row matches; the new unique
    /// index on `public_uuid` keeps the lookup O(1).
    pub async fn get_by_uuid(
        conn: &mut AsyncPgConnection,
        game: Game,
        public_uuid: uuid::Uuid,
    ) -> QueryResult<Option<MatchRow>> {
        matches::table
            .filter(matches::game.eq(game))
            .filter(matches::public_uuid.eq(public_uuid))
            .select(MatchRow::as_select())
            .first(conn)
            .await
            .optional()
    }
}
