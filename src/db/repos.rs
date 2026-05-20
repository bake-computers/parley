//! Async repositories — aggregate-shaped DB access.
//!
//! Every repo takes a `&mut AsyncPgConnection` borrowed from the bb8 pool.
//! Callers hold the pool checkout for the request lifetime; repos never
//! checkout themselves (so callers can transactionally chain multiple ops).

use diesel::dsl::sql;
use diesel::prelude::*;
use diesel::sql_types::BigInt;
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::db::models::{
    DiscordIdentity, ExternalMatchHistoryEntry, NewDiscordIdentity, NewExternalMatchHistoryEntry,
    NewPlayer, NewPlayerStatSnapshot, Player, PlayerStatSnapshot,
};
use crate::db::schema::{
    discord_identities, external_match_history, player_stat_snapshots, players,
};
use crate::db::Game;

/// Epoch-millis helper used by every write path.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn normalize_username(u: &str) -> String {
    u.trim().to_ascii_lowercase()
}

// ======================================================================
// Player
// ======================================================================

pub struct PlayerRepo;

impl PlayerRepo {
    /// Idempotent lookup-or-create keyed by `(game, username_normalized, platform)`.
    /// Returns the stable `Player` row including its primary key.
    pub async fn upsert_by_identity(
        conn: &mut AsyncPgConnection,
        game: Game,
        username: &str,
        platform: &str,
        profile_id: Option<&str>,
        profile_url: Option<&str>,
    ) -> QueryResult<Player> {
        let normalized = normalize_username(username);
        let now = now_ms();

        let row = NewPlayer {
            game,
            profile_id,
            username,
            username_normalized: &normalized,
            platform,
            profile_url,
            level: 0,
            internal_elo: 1000.0,
            internal_matches: 0,
            internal_wins: 0,
            internal_losses: 0,
            internal_updated_at: None,
            created_at: now,
            updated_at: now,
        };

        diesel::insert_into(players::table)
            .values(&row)
            .on_conflict((
                players::game,
                players::username_normalized,
                players::platform,
            ))
            .do_update()
            .set((
                players::username.eq(diesel::upsert::excluded(players::username)),
                players::profile_url.eq(diesel::upsert::excluded(players::profile_url)),
                players::profile_id.eq(diesel::upsert::excluded(players::profile_id)),
                players::updated_at.eq(now),
            ))
            .returning(Player::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn find(conn: &mut AsyncPgConnection, id: i32) -> QueryResult<Option<Player>> {
        players::table
            .find(id)
            .select(Player::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn find_by_identity(
        conn: &mut AsyncPgConnection,
        game: Game,
        username: &str,
        platform: &str,
    ) -> QueryResult<Option<Player>> {
        let normalized = normalize_username(username);
        players::table
            .filter(players::game.eq(game))
            .filter(players::username_normalized.eq(normalized))
            .filter(players::platform.eq(platform))
            .select(Player::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn touch_internal_updated_at(
        conn: &mut AsyncPgConnection,
        id: i32,
    ) -> QueryResult<usize> {
        let now = now_ms();
        diesel::update(players::table.find(id))
            .set((
                players::internal_updated_at.eq(Some(now)),
                players::updated_at.eq(now),
            ))
            .execute(conn)
            .await
    }
}

// ======================================================================
// DiscordIdentity
// ======================================================================

pub struct DiscordIdentityRepo;

impl DiscordIdentityRepo {
    /// Idempotent link: ensures exactly one `(game, discord_user_id)` row
    /// pointing at `player_id`. If a different player was previously linked
    /// for that `(game, discord_user_id)`, this RE-LINKS to the new player.
    pub async fn link(
        conn: &mut AsyncPgConnection,
        game: Game,
        discord_user_id: &str,
        player_id: i32,
    ) -> QueryResult<DiscordIdentity> {
        let now = now_ms();
        let row = NewDiscordIdentity {
            game,
            discord_user_id,
            player_id,
            created_at: now,
            updated_at: now,
        };
        diesel::insert_into(discord_identities::table)
            .values(&row)
            .on_conflict((
                discord_identities::game,
                discord_identities::discord_user_id,
            ))
            .do_update()
            .set((
                discord_identities::player_id.eq(player_id),
                discord_identities::updated_at.eq(now),
            ))
            .returning(DiscordIdentity::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn unlink(
        conn: &mut AsyncPgConnection,
        game: Game,
        discord_user_id: &str,
    ) -> QueryResult<usize> {
        diesel::delete(
            discord_identities::table
                .filter(discord_identities::game.eq(game))
                .filter(discord_identities::discord_user_id.eq(discord_user_id)),
        )
        .execute(conn)
        .await
    }

    pub async fn find_by_discord(
        conn: &mut AsyncPgConnection,
        game: Option<Game>,
        discord_user_id: &str,
    ) -> QueryResult<Vec<DiscordIdentity>> {
        let mut q = discord_identities::table
            .filter(discord_identities::discord_user_id.eq(discord_user_id))
            .into_boxed();
        if let Some(g) = game {
            q = q.filter(discord_identities::game.eq(g));
        }
        q.select(DiscordIdentity::as_select()).load(conn).await
    }
}

// ======================================================================
// PlayerStatSnapshot
// ======================================================================

pub struct PlayerStatSnapshotRepo;

impl PlayerStatSnapshotRepo {
    /// Insert a new snapshot row; returns the inserted row.
    pub async fn insert(
        conn: &mut AsyncPgConnection,
        new_row: NewPlayerStatSnapshot<'_>,
    ) -> QueryResult<PlayerStatSnapshot> {
        diesel::insert_into(player_stat_snapshots::table)
            .values(new_row)
            .returning(PlayerStatSnapshot::as_returning())
            .get_result(conn)
            .await
    }

    /// Latest snapshot for `(game, player_id)`.
    pub async fn latest_for_player(
        conn: &mut AsyncPgConnection,
        game: Game,
        player_id: i32,
    ) -> QueryResult<Option<PlayerStatSnapshot>> {
        player_stat_snapshots::table
            .filter(player_stat_snapshots::game.eq(game))
            .filter(player_stat_snapshots::player_id.eq(player_id))
            .order(player_stat_snapshots::fetched_at.desc())
            .limit(1)
            .select(PlayerStatSnapshot::as_select())
            .first(conn)
            .await
            .optional()
    }

    /// Latest snapshot for `(game, player_id)` whose `fetched_at` is within
    /// `max_age_ms` of `reference_time_ms`. Used by the Postgres-backed
    /// cache's fast path.
    pub async fn latest_fresh(
        conn: &mut AsyncPgConnection,
        game: Game,
        player_id: i32,
        reference_time_ms: i64,
        max_age_ms: i64,
    ) -> QueryResult<Option<PlayerStatSnapshot>> {
        let cutoff = reference_time_ms - max_age_ms;
        player_stat_snapshots::table
            .filter(player_stat_snapshots::game.eq(game))
            .filter(player_stat_snapshots::player_id.eq(player_id))
            .filter(player_stat_snapshots::fetched_at.ge(cutoff))
            .order(player_stat_snapshots::fetched_at.desc())
            .limit(1)
            .select(PlayerStatSnapshot::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn count_for_player(
        conn: &mut AsyncPgConnection,
        game: Game,
        player_id: i32,
    ) -> QueryResult<i64> {
        player_stat_snapshots::table
            .filter(player_stat_snapshots::game.eq(game))
            .filter(player_stat_snapshots::player_id.eq(player_id))
            .select(sql::<BigInt>("COUNT(*)::bigint"))
            .first(conn)
            .await
    }
}

// ======================================================================
// ExternalMatchHistoryEntry
// ======================================================================

pub struct ExternalMatchHistoryRepo;

impl ExternalMatchHistoryRepo {
    /// Insert, but do nothing if a `(game, player_id, external_match_id)` row
    /// already exists (same match discovered again on a later fetch).
    pub async fn insert_ignore(
        conn: &mut AsyncPgConnection,
        row: NewExternalMatchHistoryEntry<'_>,
    ) -> QueryResult<Option<ExternalMatchHistoryEntry>> {
        diesel::insert_into(external_match_history::table)
            .values(row)
            .on_conflict((
                external_match_history::game,
                external_match_history::player_id,
                external_match_history::external_match_id,
            ))
            .do_nothing()
            .returning(ExternalMatchHistoryEntry::as_returning())
            .get_result(conn)
            .await
            .optional()
    }

    pub async fn recent(
        conn: &mut AsyncPgConnection,
        game: Game,
        player_id: i32,
        limit: i64,
    ) -> QueryResult<Vec<ExternalMatchHistoryEntry>> {
        external_match_history::table
            .filter(external_match_history::game.eq(game))
            .filter(external_match_history::player_id.eq(player_id))
            .order(external_match_history::played_at.desc())
            .limit(limit)
            .select(ExternalMatchHistoryEntry::as_select())
            .load(conn)
            .await
    }
}

// ======================================================================
// Task 4 repos — guild-scoped CRUD (remaining match/queue repos are built
// on demand; the schema is enough for Task 15 + future work to compile).
// ======================================================================

use crate::db::models::{
    GuildMatchQuota, GuildMatchmakingRules, GuildMembership, GuildNotificationSettings,
    GuildSettings, NewGuildMatchQuota, NewGuildMatchmakingRules, NewGuildMembership,
    NewGuildNotificationSettings, NewGuildSettings,
};
use crate::db::schema::{
    guild_match_quotas, guild_matchmaking_rules, guild_memberships, guild_notification_settings,
    guild_settings,
};

// ---------- GuildMembership ----------

pub struct GuildMembershipRepo;

impl GuildMembershipRepo {
    /// Idempotent upsert keyed by `(game, guild_id, discord_user_id)`.
    pub async fn upsert(
        conn: &mut AsyncPgConnection,
        game: Game,
        guild_id: &str,
        discord_user_id: &str,
        player_id: i32,
    ) -> QueryResult<GuildMembership> {
        let now = now_ms();
        let row = NewGuildMembership {
            game,
            guild_id,
            discord_user_id,
            player_id,
            internal_elo: 1000.0,
            internal_matches: 0,
            internal_wins: 0,
            internal_losses: 0,
            internal_updated_at: None,
            created_at: now,
            updated_at: now,
        };
        diesel::insert_into(guild_memberships::table)
            .values(&row)
            .on_conflict((
                guild_memberships::game,
                guild_memberships::guild_id,
                guild_memberships::discord_user_id,
            ))
            .do_update()
            .set((
                guild_memberships::player_id.eq(player_id),
                guild_memberships::updated_at.eq(now),
            ))
            .returning(GuildMembership::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn top_by_elo(
        conn: &mut AsyncPgConnection,
        game: Game,
        guild_id: &str,
        limit: i64,
    ) -> QueryResult<Vec<GuildMembership>> {
        guild_memberships::table
            .filter(guild_memberships::game.eq(game))
            .filter(guild_memberships::guild_id.eq(guild_id))
            .order(guild_memberships::internal_elo.desc())
            .limit(limit)
            .select(GuildMembership::as_select())
            .load(conn)
            .await
    }
}

// ---------- GuildSettings ----------

pub struct GuildSettingsRepo;

impl GuildSettingsRepo {
    pub async fn get(
        conn: &mut AsyncPgConnection,
        guild_id: &str,
        game: Game,
    ) -> QueryResult<Option<GuildSettings>> {
        guild_settings::table
            .filter(guild_settings::guild_id.eq(guild_id))
            .filter(guild_settings::game.eq(game))
            .select(GuildSettings::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn upsert(
        conn: &mut AsyncPgConnection,
        row: NewGuildSettings<'_>,
    ) -> QueryResult<GuildSettings> {
        let now = row.updated_at;
        let default_team_format = row.default_team_format.map(|s| s.to_string());
        let updated_by_discord_user_id = row.updated_by_discord_user_id.to_string();
        let auto_balance = row.auto_balance;
        let cross_guild_matchmaking = row.cross_guild_matchmaking;
        diesel::insert_into(guild_settings::table)
            .values(&row)
            .on_conflict((guild_settings::guild_id, guild_settings::game))
            .do_update()
            .set((
                guild_settings::default_team_format.eq(default_team_format),
                guild_settings::auto_balance.eq(auto_balance),
                guild_settings::cross_guild_matchmaking.eq(cross_guild_matchmaking),
                guild_settings::updated_at.eq(now),
                guild_settings::updated_by_discord_user_id.eq(updated_by_discord_user_id),
            ))
            .returning(GuildSettings::as_returning())
            .get_result(conn)
            .await
    }
}

// ---------- GuildMatchmakingRules ----------

pub struct GuildMatchmakingRulesRepo;

impl GuildMatchmakingRulesRepo {
    pub async fn get(
        conn: &mut AsyncPgConnection,
        guild_id: &str,
        game: Game,
    ) -> QueryResult<Option<GuildMatchmakingRules>> {
        guild_matchmaking_rules::table
            .filter(guild_matchmaking_rules::guild_id.eq(guild_id))
            .filter(guild_matchmaking_rules::game.eq(game))
            .select(GuildMatchmakingRules::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn upsert(
        conn: &mut AsyncPgConnection,
        row: NewGuildMatchmakingRules<'_>,
    ) -> QueryResult<GuildMatchmakingRules> {
        let now = row.updated_at;
        let min_elo = row.min_elo;
        let max_elo = row.max_elo;
        let require_verified = row.require_verified;
        let max_elo_gap = row.max_elo_gap;
        let platforms = row.platforms.clone();
        diesel::insert_into(guild_matchmaking_rules::table)
            .values(&row)
            .on_conflict((
                guild_matchmaking_rules::guild_id,
                guild_matchmaking_rules::game,
            ))
            .do_update()
            .set((
                guild_matchmaking_rules::min_elo.eq(min_elo),
                guild_matchmaking_rules::max_elo.eq(max_elo),
                guild_matchmaking_rules::platforms.eq(platforms),
                guild_matchmaking_rules::require_verified.eq(require_verified),
                guild_matchmaking_rules::max_elo_gap.eq(max_elo_gap),
                guild_matchmaking_rules::updated_at.eq(now),
            ))
            .returning(GuildMatchmakingRules::as_returning())
            .get_result(conn)
            .await
    }
}

// ---------- GuildNotificationSettings ----------

pub struct GuildNotificationSettingsRepo;

impl GuildNotificationSettingsRepo {
    pub async fn get(
        conn: &mut AsyncPgConnection,
        guild_id: &str,
        game: Game,
    ) -> QueryResult<Option<GuildNotificationSettings>> {
        guild_notification_settings::table
            .filter(guild_notification_settings::guild_id.eq(guild_id))
            .filter(guild_notification_settings::game.eq(game))
            .select(GuildNotificationSettings::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn upsert(
        conn: &mut AsyncPgConnection,
        row: NewGuildNotificationSettings<'_>,
    ) -> QueryResult<GuildNotificationSettings> {
        let now = row.updated_at;
        let match_results_channel = row.match_results_channel.map(|s| s.to_string());
        let tournament_announcements_channel =
            row.tournament_announcements_channel.map(|s| s.to_string());
        let leaderboard_updates_enabled = row.leaderboard_updates_enabled;
        diesel::insert_into(guild_notification_settings::table)
            .values(&row)
            .on_conflict((
                guild_notification_settings::guild_id,
                guild_notification_settings::game,
            ))
            .do_update()
            .set((
                guild_notification_settings::match_results_channel.eq(match_results_channel),
                guild_notification_settings::tournament_announcements_channel
                    .eq(tournament_announcements_channel),
                guild_notification_settings::leaderboard_updates_enabled
                    .eq(leaderboard_updates_enabled),
                guild_notification_settings::updated_at.eq(now),
            ))
            .returning(GuildNotificationSettings::as_returning())
            .get_result(conn)
            .await
    }
}

// ---------- GuildMatchQuota ----------

pub struct GuildMatchQuotaRepo;

impl GuildMatchQuotaRepo {
    pub async fn get(
        conn: &mut AsyncPgConnection,
        guild_id: &str,
        game: Game,
    ) -> QueryResult<Option<GuildMatchQuota>> {
        guild_match_quotas::table
            .filter(guild_match_quotas::guild_id.eq(guild_id))
            .filter(guild_match_quotas::game.eq(game))
            .select(GuildMatchQuota::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn upsert(
        conn: &mut AsyncPgConnection,
        row: NewGuildMatchQuota<'_>,
    ) -> QueryResult<GuildMatchQuota> {
        let now = row.updated_at;
        let daily_match_limit = row.daily_match_limit;
        let updated_by = row.updated_by_discord_user_id.to_string();
        diesel::insert_into(guild_match_quotas::table)
            .values(&row)
            .on_conflict((guild_match_quotas::game, guild_match_quotas::guild_id))
            .do_update()
            .set((
                guild_match_quotas::daily_match_limit.eq(daily_match_limit),
                guild_match_quotas::updated_by_discord_user_id.eq(updated_by),
                guild_match_quotas::updated_at.eq(now),
            ))
            .returning(GuildMatchQuota::as_returning())
            .get_result(conn)
            .await
    }
}
