//! Diesel schema — hand-kept in sync with SQL migrations in `/migrations`.
//!
//! Rules for staying consistent:
//!   * **Column order matches the migration's `CREATE TABLE` column order.**
//!     Diesel's `Queryable` derive positions fields by ordinal.
//!   * Every game-scoped table exposes its `game` column as `games` SQL type
//!     mapping to the Rust enum [`crate::db::Game`].
//!   * Timestamps for domain tables are `BigInt` (epoch millis).

#![allow(non_snake_case)]

pub mod sql_types {
    /// `CREATE TYPE games AS ENUM ('r6', 'brawl_stars')` — Postgres enum.
    #[derive(diesel::sql_types::SqlType, diesel::query_builder::QueryId)]
    #[diesel(postgres_type(name = "games"))]
    pub struct Games;

    /// `CREATE TYPE languages AS ENUM ('en', 'de')` — Postgres enum.
    #[derive(diesel::sql_types::SqlType, diesel::query_builder::QueryId)]
    #[diesel(postgres_type(name = "languages"))]
    pub struct Languages;
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    players (id) {
        id -> Int4,
        game -> Games,
        profile_id -> Nullable<Text>,
        username -> Text,
        username_normalized -> Text,
        platform -> Text,
        profile_url -> Nullable<Text>,
        level -> Int4,
        internal_elo -> Float8,
        internal_matches -> Int4,
        internal_wins -> Int4,
        internal_losses -> Int4,
        internal_updated_at -> Nullable<Int8>,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    discord_identities (id) {
        id -> Int4,
        game -> Games,
        discord_user_id -> Text,
        player_id -> Int4,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    player_stat_snapshots (id) {
        id -> Int4,
        player_id -> Int4,
        game -> Games,
        fetched_at -> Int8,
        source -> Text,
        cache_version -> Int4,
        current_rank -> Nullable<Text>,
        rank_points -> Int4,
        matches -> Int4,
        wins -> Int4,
        losses -> Int4,
        kills -> Int4,
        deaths -> Int4,
        assists -> Int4,
        headshots -> Int4,
        kd_ratio -> Float8,
        headshot_percentage -> Float8,
        win_rate -> Float8,
        kost -> Float8,
        metadata -> Nullable<Jsonb>,
        payload_json -> Text,
        created_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    external_match_history (id) {
        id -> Int4,
        player_id -> Int4,
        game -> Games,
        external_match_id -> Text,
        played_at -> Int8,
        fetched_at -> Int8,
        metadata -> Nullable<Jsonb>,
        created_at -> Int8,
    }
}

diesel::joinable!(discord_identities -> players (player_id));
diesel::joinable!(player_stat_snapshots -> players (player_id));
diesel::joinable!(external_match_history -> players (player_id));

diesel::allow_tables_to_appear_in_same_query!(
    players,
    discord_identities,
    player_stat_snapshots,
    external_match_history,
);

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Languages;

    user_settings (discord_user_id) {
        discord_user_id -> Text,
        language -> Languages,
        created_at -> Int8,
        updated_at -> Int8,
        matchmaking_enabled -> Bool,
    }
}

diesel::table! {
    account_deletion_cooldowns (discord_user_id_hash) {
        discord_user_id_hash -> Text,
        deleted_at -> Int8,
        cooldown_until -> Int8,
    }
}

diesel::allow_tables_to_appear_in_same_query!(user_settings, account_deletion_cooldowns);

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    guild_memberships (id) {
        id -> Int4,
        game -> Games,
        guild_id -> Text,
        discord_user_id -> Text,
        player_id -> Int4,
        internal_elo -> Float8,
        rating_deviation -> Float8,
        internal_matches -> Int4,
        internal_wins -> Int4,
        internal_losses -> Int4,
        internal_updated_at -> Nullable<Int8>,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    guild_match_quotas (id) {
        id -> Int4,
        game -> Games,
        guild_id -> Text,
        daily_match_limit -> Int4,
        updated_by_discord_user_id -> Text,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;
    use super::sql_types::Languages;

    guild_settings (guild_id, game) {
        guild_id -> Text,
        game -> Games,
        default_team_format -> Nullable<Text>,
        auto_balance -> Bool,
        cross_guild_matchmaking -> Bool,
        updated_at -> Int8,
        updated_by_discord_user_id -> Text,
        default_language -> Languages,
        matchmaking_enabled -> Bool,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    guild_matchmaking_rules (guild_id, game) {
        guild_id -> Text,
        game -> Games,
        min_elo -> Nullable<Int4>,
        max_elo -> Nullable<Int4>,
        platforms -> Nullable<Array<Text>>,
        require_verified -> Bool,
        max_elo_gap -> Int4,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    guild_notification_settings (guild_id, game) {
        guild_id -> Text,
        game -> Games,
        match_results_channel -> Nullable<Text>,
        tournament_announcements_channel -> Nullable<Text>,
        leaderboard_updates_enabled -> Bool,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    tournament_schedules (id) {
        id -> Int4,
        game -> Games,
        guild_id -> Text,
        name -> Text,
        format -> Text,
        team_cap -> Int4,
        cron_expression -> Text,
        channel_id -> Text,
        role_id -> Nullable<Text>,
        enabled -> Bool,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    matches (id) {
        id -> Int4,
        game -> Games,
        guild_id -> Text,
        channel_id -> Text,
        message_id -> Text,
        created_by_discord_user_id -> Text,
        status -> Text,
        match_type -> Text,
        opponent_guild_id -> Nullable<Text>,
        opponent_channel_id -> Nullable<Text>,
        opponent_message_id -> Nullable<Text>,
        opponent_captain_discord_user_id -> Nullable<Text>,
        team_a_seed_total -> Float8,
        team_b_seed_total -> Float8,
        seed_gap -> Float8,
        winning_team -> Nullable<Text>,
        resolution_type -> Text,
        team_a_balance_total -> Float8,
        team_b_balance_total -> Float8,
        balance_gap -> Float8,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    match_participants (id) {
        id -> Int4,
        game -> Games,
        match_id -> Int4,
        discord_user_id -> Text,
        player_id -> Int4,
        team -> Text,
        slot -> Int4,
        seed_rank_points -> Int4,
        seed_kd_ratio -> Float8,
        seed_kost -> Float8,
        seed_kpr -> Float8,
        seed_headshot_percentage -> Float8,
        seed_score -> Float8,
        balance_rating -> Float8,
        kills -> Nullable<Int4>,
        deaths -> Nullable<Int4>,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    matchmaking_queues (id) {
        id -> Int4,
        game -> Games,
        guild_id -> Text,
        channel_id -> Text,
        captain_discord_user_id -> Text,
        status -> Text,
        player_count -> Int4,
        stack_balance_total -> Float8,
        stack_balance_average -> Float8,
        matched_match_id -> Nullable<Int4>,
        expires_at -> Int8,
        created_at -> Int8,
        updated_at -> Int8,
        team_size -> Int4,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    matchmaking_queue_participants (id) {
        id -> Int4,
        game -> Games,
        queue_id -> Int4,
        discord_user_id -> Text,
        player_id -> Int4,
        slot -> Int4,
        username -> Text,
        platform -> Text,
        balance_rating -> Float8,
        seed_rank_points -> Int4,
        seed_kd_ratio -> Float8,
        seed_kost -> Float8,
        seed_kpr -> Float8,
        seed_headshot_percentage -> Float8,
        seed_score -> Float8,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

// FK wiring for the new tables.
diesel::joinable!(guild_memberships -> players (player_id));
diesel::joinable!(match_participants -> matches (match_id));
diesel::joinable!(match_participants -> players (player_id));
diesel::joinable!(matchmaking_queues -> matches (matched_match_id));
diesel::joinable!(matchmaking_queue_participants -> matchmaking_queues (queue_id));
diesel::joinable!(matchmaking_queue_participants -> players (player_id));

diesel::allow_tables_to_appear_in_same_query!(
    guild_memberships,
    guild_match_quotas,
    guild_settings,
    guild_matchmaking_rules,
    guild_notification_settings,
    tournament_schedules,
    matches,
    match_participants,
    matchmaking_queues,
    matchmaking_queue_participants,
    players,
);

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    tournaments (id) {
        id -> Int4,
        game -> Games,
        name -> Text,
        name_normalized -> Text,
        format -> Text,
        team_cap -> Int4,
        visibility -> Text,
        status -> Text,
        created_by_guild_id -> Text,
        created_by_channel_id -> Text,
        created_by_discord_user_id -> Text,
        hub_message_id -> Nullable<Text>,
        filled_at -> Nullable<Int8>,
        auto_start_at -> Nullable<Int8>,
        started_at -> Nullable<Int8>,
        completed_at -> Nullable<Int8>,
        winner_entry_id -> Nullable<Int4>,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    tournament_teams (id) {
        id -> Int4,
        game -> Games,
        tournament_id -> Int4,
        guild_id -> Text,
        channel_id -> Text,
        captain_discord_user_id -> Text,
        team_name -> Text,
        team_name_normalized -> Text,
        status -> Text,
        seed_number -> Nullable<Int4>,
        stack_balance_total -> Float8,
        stack_balance_average -> Float8,
        joined_at -> Int8,
        eliminated_at -> Nullable<Int8>,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    tournament_team_rosters (id) {
        id -> Int4,
        game -> Games,
        tournament_id -> Int4,
        team_id -> Int4,
        discord_user_id -> Text,
        player_id -> Int4,
        slot -> Int4,
        username -> Text,
        platform -> Text,
        balance_rating -> Float8,
        seed_rank_points -> Int4,
        seed_kd_ratio -> Float8,
        seed_kost -> Float8,
        seed_kpr -> Float8,
        seed_headshot_percentage -> Float8,
        seed_score -> Float8,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Games;

    bracket_matches (id) {
        id -> Int4,
        game -> Games,
        tournament_id -> Int4,
        bracket -> Text,
        round_number -> Int4,
        match_number -> Int4,
        status -> Text,
        team_a_id -> Nullable<Int4>,
        team_b_id -> Nullable<Int4>,
        winner_team_id -> Nullable<Int4>,
        loser_team_id -> Nullable<Int4>,
        winner_to_match_id -> Nullable<Int4>,
        winner_to_slot -> Nullable<Text>,
        loser_to_match_id -> Nullable<Int4>,
        loser_to_slot -> Nullable<Text>,
        custom_match_id -> Nullable<Int4>,
        created_at -> Int8,
        updated_at -> Int8,
    }
}

diesel::joinable!(tournament_teams -> tournaments (tournament_id));
diesel::joinable!(tournament_team_rosters -> tournaments (tournament_id));
diesel::joinable!(tournament_team_rosters -> tournament_teams (team_id));
diesel::joinable!(tournament_team_rosters -> players (player_id));
diesel::joinable!(bracket_matches -> tournaments (tournament_id));
diesel::joinable!(bracket_matches -> matches (custom_match_id));

diesel::allow_tables_to_appear_in_same_query!(
    tournaments,
    tournament_teams,
    tournament_team_rosters,
    bracket_matches,
);
