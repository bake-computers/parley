//! Diesel `Queryable`/`Insertable`/`AsChangeset` structs per table.
//!
//! Field order **must** match the schema column order for Queryable derives
//! to position correctly.

use crate::db::schema::{
    account_deletion_cooldowns, discord_identities, external_match_history, player_stat_snapshots,
    players, user_settings,
};
use crate::db::{Game, Language};

// ---------- players ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = players)]
pub struct Player {
    pub id: i32,
    pub game: Game,
    pub profile_id: Option<String>,
    pub username: String,
    pub username_normalized: String,
    pub platform: String,
    pub profile_url: Option<String>,
    pub level: i32,
    pub internal_elo: f64,
    pub internal_matches: i32,
    pub internal_wins: i32,
    pub internal_losses: i32,
    pub internal_updated_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = players)]
pub struct NewPlayer<'a> {
    pub game: Game,
    pub profile_id: Option<&'a str>,
    pub username: &'a str,
    pub username_normalized: &'a str,
    pub platform: &'a str,
    pub profile_url: Option<&'a str>,
    pub level: i32,
    pub internal_elo: f64,
    pub internal_matches: i32,
    pub internal_wins: i32,
    pub internal_losses: i32,
    pub internal_updated_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::AsChangeset)]
#[diesel(table_name = players)]
pub struct PlayerChangeset<'a> {
    pub profile_id: Option<Option<&'a str>>,
    pub username: Option<&'a str>,
    pub username_normalized: Option<&'a str>,
    pub platform: Option<&'a str>,
    pub profile_url: Option<Option<&'a str>>,
    pub level: Option<i32>,
    pub internal_elo: Option<f64>,
    pub internal_matches: Option<i32>,
    pub internal_wins: Option<i32>,
    pub internal_losses: Option<i32>,
    pub internal_updated_at: Option<Option<i64>>,
    pub updated_at: Option<i64>,
}

// ---------- discord_identities ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = discord_identities)]
pub struct DiscordIdentity {
    pub id: i32,
    pub game: Game,
    pub discord_user_id: String,
    pub player_id: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = discord_identities)]
pub struct NewDiscordIdentity<'a> {
    pub game: Game,
    pub discord_user_id: &'a str,
    pub player_id: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------- player_stat_snapshots ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = player_stat_snapshots)]
pub struct PlayerStatSnapshot {
    pub id: i32,
    pub player_id: i32,
    pub game: Game,
    pub fetched_at: i64,
    pub source: String,
    pub cache_version: i32,
    pub current_rank: Option<String>,
    pub rank_points: i32,
    pub matches: i32,
    pub wins: i32,
    pub losses: i32,
    pub kills: i32,
    pub deaths: i32,
    pub assists: i32,
    pub headshots: i32,
    pub kd_ratio: f64,
    pub headshot_percentage: f64,
    pub win_rate: f64,
    pub kost: f64,
    pub metadata: Option<serde_json::Value>,
    pub payload_json: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = player_stat_snapshots)]
pub struct NewPlayerStatSnapshot<'a> {
    pub player_id: i32,
    pub game: Game,
    pub fetched_at: i64,
    pub source: &'a str,
    pub cache_version: i32,
    pub current_rank: Option<&'a str>,
    pub rank_points: i32,
    pub matches: i32,
    pub wins: i32,
    pub losses: i32,
    pub kills: i32,
    pub deaths: i32,
    pub assists: i32,
    pub headshots: i32,
    pub kd_ratio: f64,
    pub headshot_percentage: f64,
    pub win_rate: f64,
    pub kost: f64,
    pub metadata: Option<serde_json::Value>,
    pub payload_json: &'a str,
    pub created_at: i64,
}

// ---------- external_match_history ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = external_match_history)]
pub struct ExternalMatchHistoryEntry {
    pub id: i32,
    pub player_id: i32,
    pub game: Game,
    pub external_match_id: String,
    pub played_at: i64,
    pub fetched_at: i64,
    pub metadata: Option<serde_json::Value>,
    pub created_at: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = external_match_history)]
pub struct NewExternalMatchHistoryEntry<'a> {
    pub player_id: i32,
    pub game: Game,
    pub external_match_id: &'a str,
    pub played_at: i64,
    pub fetched_at: i64,
    pub metadata: Option<serde_json::Value>,
    pub created_at: i64,
}

// ---------- user_settings ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable)]
#[diesel(table_name = user_settings)]
pub struct UserSettings {
    pub discord_user_id: String,
    pub language: Language,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = user_settings)]
pub struct NewUserSettings<'a> {
    pub discord_user_id: &'a str,
    pub language: Language,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------- account_deletion_cooldowns ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable)]
#[diesel(table_name = account_deletion_cooldowns)]
pub struct AccountDeletionCooldown {
    pub discord_user_id_hash: String,
    pub deleted_at: i64,
    pub cooldown_until: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = account_deletion_cooldowns)]
pub struct NewAccountDeletionCooldown<'a> {
    pub discord_user_id_hash: &'a str,
    pub deleted_at: i64,
    pub cooldown_until: i64,
}

// ===================================================================
// Task 4 — guild + matchmaking + match tables
// ===================================================================

use crate::db::schema::{
    guild_match_quotas, guild_matchmaking_rules, guild_memberships, guild_notification_settings,
    guild_settings, match_participants, matches, matchmaking_queue_participants,
    matchmaking_queues, tournament_schedules,
};

// ---------- guild_memberships ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = guild_memberships)]
pub struct GuildMembership {
    pub id: i32,
    pub game: Game,
    pub guild_id: String,
    pub discord_user_id: String,
    pub player_id: i32,
    pub internal_elo: f64,
    pub internal_matches: i32,
    pub internal_wins: i32,
    pub internal_losses: i32,
    pub internal_updated_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = guild_memberships)]
pub struct NewGuildMembership<'a> {
    pub game: Game,
    pub guild_id: &'a str,
    pub discord_user_id: &'a str,
    pub player_id: i32,
    pub internal_elo: f64,
    pub internal_matches: i32,
    pub internal_wins: i32,
    pub internal_losses: i32,
    pub internal_updated_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------- guild_match_quotas ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = guild_match_quotas)]
pub struct GuildMatchQuota {
    pub id: i32,
    pub game: Game,
    pub guild_id: String,
    pub daily_match_limit: i32,
    pub updated_by_discord_user_id: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = guild_match_quotas)]
pub struct NewGuildMatchQuota<'a> {
    pub game: Game,
    pub guild_id: &'a str,
    pub daily_match_limit: i32,
    pub updated_by_discord_user_id: &'a str,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------- guild_settings ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable)]
#[diesel(table_name = guild_settings)]
pub struct GuildSettings {
    pub guild_id: String,
    pub game: Game,
    pub default_team_format: Option<String>,
    pub auto_balance: bool,
    pub cross_guild_matchmaking: bool,
    pub updated_at: i64,
    pub updated_by_discord_user_id: String,
    pub default_language: Language,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = guild_settings)]
pub struct NewGuildSettings<'a> {
    pub guild_id: &'a str,
    pub game: Game,
    pub default_team_format: Option<&'a str>,
    pub auto_balance: bool,
    pub cross_guild_matchmaking: bool,
    pub updated_at: i64,
    pub updated_by_discord_user_id: &'a str,
    pub default_language: Language,
}

// ---------- guild_matchmaking_rules ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable)]
#[diesel(table_name = guild_matchmaking_rules)]
pub struct GuildMatchmakingRules {
    pub guild_id: String,
    pub game: Game,
    pub min_elo: Option<i32>,
    pub max_elo: Option<i32>,
    pub platforms: Option<Vec<String>>,
    pub require_verified: bool,
    pub max_elo_gap: i32,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = guild_matchmaking_rules)]
pub struct NewGuildMatchmakingRules<'a> {
    pub guild_id: &'a str,
    pub game: Game,
    pub min_elo: Option<i32>,
    pub max_elo: Option<i32>,
    pub platforms: Option<Vec<String>>,
    pub require_verified: bool,
    pub max_elo_gap: i32,
    pub updated_at: i64,
}

// ---------- guild_notification_settings ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable)]
#[diesel(table_name = guild_notification_settings)]
pub struct GuildNotificationSettings {
    pub guild_id: String,
    pub game: Game,
    pub match_results_channel: Option<String>,
    pub tournament_announcements_channel: Option<String>,
    pub leaderboard_updates_enabled: bool,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = guild_notification_settings)]
pub struct NewGuildNotificationSettings<'a> {
    pub guild_id: &'a str,
    pub game: Game,
    pub match_results_channel: Option<&'a str>,
    pub tournament_announcements_channel: Option<&'a str>,
    pub leaderboard_updates_enabled: bool,
    pub updated_at: i64,
}

// ---------- tournament_schedules ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = tournament_schedules)]
pub struct TournamentSchedule {
    pub id: i32,
    pub game: Game,
    pub guild_id: String,
    pub name: String,
    pub format: String,
    pub team_cap: i32,
    pub cron_expression: String,
    pub channel_id: String,
    pub role_id: Option<String>,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------- matches ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = matches)]
pub struct MatchRow {
    pub id: i32,
    pub game: Game,
    pub guild_id: String,
    pub channel_id: String,
    pub message_id: String,
    pub created_by_discord_user_id: String,
    pub status: String,
    pub match_type: String,
    pub opponent_guild_id: Option<String>,
    pub opponent_channel_id: Option<String>,
    pub opponent_message_id: Option<String>,
    pub opponent_captain_discord_user_id: Option<String>,
    pub team_a_seed_total: f64,
    pub team_b_seed_total: f64,
    pub seed_gap: f64,
    pub winning_team: Option<String>,
    pub resolution_type: String,
    pub team_a_balance_total: f64,
    pub team_b_balance_total: f64,
    pub balance_gap: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------- match_participants ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = match_participants)]
pub struct MatchParticipant {
    pub id: i32,
    pub game: Game,
    pub match_id: i32,
    pub discord_user_id: String,
    pub player_id: i32,
    pub team: String,
    pub slot: i32,
    pub seed_rank_points: i32,
    pub seed_kd_ratio: f64,
    pub seed_kost: f64,
    pub seed_kpr: f64,
    pub seed_headshot_percentage: f64,
    pub seed_score: f64,
    pub balance_rating: f64,
    pub kills: Option<i32>,
    pub deaths: Option<i32>,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------- matchmaking_queues ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = matchmaking_queues)]
pub struct MatchmakingQueue {
    pub id: i32,
    pub game: Game,
    pub guild_id: String,
    pub channel_id: String,
    pub captain_discord_user_id: String,
    pub status: String,
    pub player_count: i32,
    pub stack_balance_total: f64,
    pub stack_balance_average: f64,
    pub matched_match_id: Option<i32>,
    pub expires_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------- matchmaking_queue_participants ----------

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = matchmaking_queue_participants)]
pub struct MatchmakingQueueParticipant {
    pub id: i32,
    pub game: Game,
    pub queue_id: i32,
    pub discord_user_id: String,
    pub player_id: i32,
    pub slot: i32,
    pub username: String,
    pub platform: String,
    pub balance_rating: f64,
    pub seed_rank_points: i32,
    pub seed_kd_ratio: f64,
    pub seed_kost: f64,
    pub seed_kpr: f64,
    pub seed_headshot_percentage: f64,
    pub seed_score: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

// ===================================================================
// Task 5 — tournament tables (Queryable only; repos follow consumers)
// ===================================================================

use crate::db::schema::{bracket_matches, tournament_team_rosters, tournament_teams, tournaments};

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = tournaments)]
pub struct Tournament {
    pub id: i32,
    pub game: Game,
    pub name: String,
    pub name_normalized: String,
    pub format: String,
    pub team_cap: i32,
    pub visibility: String,
    pub status: String,
    pub created_by_guild_id: String,
    pub created_by_channel_id: String,
    pub created_by_discord_user_id: String,
    pub hub_message_id: Option<String>,
    pub filled_at: Option<i64>,
    pub auto_start_at: Option<i64>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub winner_entry_id: Option<i32>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = tournament_teams)]
pub struct TournamentTeam {
    pub id: i32,
    pub game: Game,
    pub tournament_id: i32,
    pub guild_id: String,
    pub channel_id: String,
    pub captain_discord_user_id: String,
    pub team_name: String,
    pub team_name_normalized: String,
    pub status: String,
    pub seed_number: Option<i32>,
    pub stack_balance_total: f64,
    pub stack_balance_average: f64,
    pub joined_at: i64,
    pub eliminated_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = tournament_team_rosters)]
pub struct TournamentTeamRoster {
    pub id: i32,
    pub game: Game,
    pub tournament_id: i32,
    pub team_id: i32,
    pub discord_user_id: String,
    pub player_id: i32,
    pub slot: i32,
    pub username: String,
    pub platform: String,
    pub balance_rating: f64,
    pub seed_rank_points: i32,
    pub seed_kd_ratio: f64,
    pub seed_kost: f64,
    pub seed_kpr: f64,
    pub seed_headshot_percentage: f64,
    pub seed_score: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable, diesel::Identifiable)]
#[diesel(table_name = bracket_matches)]
pub struct BracketMatch {
    pub id: i32,
    pub game: Game,
    pub tournament_id: i32,
    pub bracket: String,
    pub round_number: i32,
    pub match_number: i32,
    pub status: String,
    pub team_a_id: Option<i32>,
    pub team_b_id: Option<i32>,
    pub winner_team_id: Option<i32>,
    pub loser_team_id: Option<i32>,
    pub winner_to_match_id: Option<i32>,
    pub winner_to_slot: Option<String>,
    pub loser_to_match_id: Option<i32>,
    pub loser_to_slot: Option<String>,
    pub custom_match_id: Option<i32>,
    pub created_at: i64,
    pub updated_at: i64,
}
