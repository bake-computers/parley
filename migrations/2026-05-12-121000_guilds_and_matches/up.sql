-- Guild + matchmaking + match tables, ported 1-to-1 from `main`-branch
-- Drizzle with renames and game discriminator. Unique/index keys rescoped
-- by game so per-game membership/settings coexist for one guild.
--
-- Renames applied here:
--     guild_players                 -> guild_memberships
--     guild_limits                  -> guild_match_quotas
--     auto_tournament_schedules     -> tournament_schedules
--     guild_match_rules             -> guild_matchmaking_rules
--     custom_matches                -> matches
--     custom_match_players          -> match_participants
--     matchmaking_queue_players     -> matchmaking_queue_participants

-- --------------------------------------------------------------------------
-- guild_memberships  (was guild_players)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guild_memberships (
    id                   serial PRIMARY KEY,
    game                 games  NOT NULL DEFAULT 'r6',
    guild_id             text   NOT NULL,
    discord_user_id      text   NOT NULL,
    player_id            integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    internal_elo         double precision NOT NULL DEFAULT 1000,
    internal_matches     integer          NOT NULL DEFAULT 0,
    internal_wins        integer          NOT NULL DEFAULT 0,
    internal_losses      integer          NOT NULL DEFAULT 0,
    internal_updated_at  bigint,
    created_at           bigint NOT NULL,
    updated_at           bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS guild_memberships_game_guild_user_unique
    ON guild_memberships (game, guild_id, discord_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS guild_memberships_game_guild_player_unique
    ON guild_memberships (game, guild_id, player_id);
CREATE INDEX        IF NOT EXISTS guild_memberships_player_idx
    ON guild_memberships (player_id);
CREATE INDEX        IF NOT EXISTS guild_memberships_discord_user_idx
    ON guild_memberships (discord_user_id);
-- Performance index for leaderboards: top-N by internal_elo within a guild+game.
CREATE INDEX        IF NOT EXISTS guild_memberships_game_guild_elo_idx
    ON guild_memberships (game, guild_id, internal_elo DESC);

-- --------------------------------------------------------------------------
-- guild_match_quotas  (was guild_limits)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guild_match_quotas (
    id                          serial PRIMARY KEY,
    game                        games  NOT NULL DEFAULT 'r6',
    guild_id                    text   NOT NULL,
    daily_match_limit           integer NOT NULL,
    updated_by_discord_user_id  text   NOT NULL,
    created_at                  bigint NOT NULL,
    updated_at                  bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS guild_match_quotas_game_guild_unique
    ON guild_match_quotas (game, guild_id);

-- --------------------------------------------------------------------------
-- guild_settings
-- PK is compound (guild_id, game) so a single guild has distinct settings
-- per game (R6 vs CS2 defaults).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id                    text  NOT NULL,
    game                        games NOT NULL DEFAULT 'r6',
    default_team_format         text,
    auto_balance                boolean NOT NULL DEFAULT true,
    cross_guild_matchmaking     boolean NOT NULL DEFAULT true,
    updated_at                  bigint NOT NULL,
    updated_by_discord_user_id  text   NOT NULL,
    PRIMARY KEY (guild_id, game)
);

-- --------------------------------------------------------------------------
-- guild_matchmaking_rules  (was guild_match_rules)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guild_matchmaking_rules (
    guild_id          text    NOT NULL,
    game              games   NOT NULL DEFAULT 'r6',
    min_elo           integer,
    max_elo           integer,
    platforms         text[],
    require_verified  boolean NOT NULL DEFAULT false,
    max_elo_gap       integer NOT NULL DEFAULT 500,
    updated_at        bigint  NOT NULL,
    PRIMARY KEY (guild_id, game)
);

-- --------------------------------------------------------------------------
-- guild_notification_settings
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guild_notification_settings (
    guild_id                           text    NOT NULL,
    game                               games   NOT NULL DEFAULT 'r6',
    match_results_channel              text,
    tournament_announcements_channel   text,
    leaderboard_updates_enabled        boolean NOT NULL DEFAULT false,
    updated_at                         bigint  NOT NULL,
    PRIMARY KEY (guild_id, game)
);

-- --------------------------------------------------------------------------
-- tournament_schedules  (was auto_tournament_schedules)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_schedules (
    id                serial PRIMARY KEY,
    game              games  NOT NULL DEFAULT 'r6',
    guild_id          text   NOT NULL,
    name              text   NOT NULL,
    format            text   NOT NULL,
    team_cap          integer NOT NULL,
    cron_expression   text   NOT NULL,
    channel_id        text   NOT NULL,
    role_id           text,
    enabled           boolean NOT NULL DEFAULT true,
    created_at        bigint NOT NULL,
    updated_at        bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS tournament_schedules_game_guild_enabled_idx
    ON tournament_schedules (game, guild_id, enabled);

-- --------------------------------------------------------------------------
-- matches  (was custom_matches)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
    id                              serial PRIMARY KEY,
    game                            games  NOT NULL DEFAULT 'r6',
    guild_id                        text   NOT NULL,
    channel_id                      text   NOT NULL,
    message_id                      text   NOT NULL,
    created_by_discord_user_id      text   NOT NULL,
    status                          text   NOT NULL,
    match_type                      text   NOT NULL DEFAULT 'internal',
    opponent_guild_id               text,
    opponent_channel_id             text,
    opponent_message_id             text,
    opponent_captain_discord_user_id text,
    team_a_seed_total               double precision NOT NULL,
    team_b_seed_total               double precision NOT NULL,
    seed_gap                        double precision NOT NULL,
    winning_team                    text,
    resolution_type                 text   NOT NULL DEFAULT 'played',
    team_a_balance_total            double precision NOT NULL DEFAULT 0,
    team_b_balance_total            double precision NOT NULL DEFAULT 0,
    balance_gap                     double precision NOT NULL DEFAULT 0,
    created_at                      bigint NOT NULL,
    updated_at                      bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_game_guild_created_idx
    ON matches (game, guild_id, created_at);
CREATE INDEX IF NOT EXISTS matches_game_opponent_guild_created_idx
    ON matches (game, opponent_guild_id, created_at);
CREATE INDEX IF NOT EXISTS matches_game_guild_status_idx
    ON matches (game, guild_id, status);
CREATE INDEX IF NOT EXISTS matches_game_match_type_status_idx
    ON matches (game, match_type, status);

-- --------------------------------------------------------------------------
-- match_participants  (was custom_match_players)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_participants (
    id                         serial PRIMARY KEY,
    game                       games   NOT NULL DEFAULT 'r6',
    match_id                   integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    discord_user_id            text    NOT NULL,
    player_id                  integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team                       text    NOT NULL,
    slot                       integer NOT NULL,
    seed_rank_points           integer NOT NULL,
    seed_kd_ratio              double precision NOT NULL,
    seed_kost                  double precision NOT NULL,
    seed_kpr                   double precision NOT NULL,
    seed_headshot_percentage   double precision NOT NULL,
    seed_score                 double precision NOT NULL,
    balance_rating             double precision NOT NULL DEFAULT 0,
    kills                      integer,
    deaths                     integer,
    created_at                 bigint  NOT NULL,
    updated_at                 bigint  NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS match_participants_match_user_unique
    ON match_participants (match_id, discord_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS match_participants_match_team_slot_unique
    ON match_participants (match_id, team, slot);

-- --------------------------------------------------------------------------
-- matchmaking_queues
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matchmaking_queues (
    id                         serial PRIMARY KEY,
    game                       games  NOT NULL DEFAULT 'r6',
    guild_id                   text   NOT NULL,
    channel_id                 text   NOT NULL,
    captain_discord_user_id    text   NOT NULL,
    status                     text   NOT NULL,
    player_count               integer NOT NULL,
    stack_balance_total        double precision NOT NULL,
    stack_balance_average      double precision NOT NULL,
    matched_match_id           integer REFERENCES matches(id) ON DELETE SET NULL,
    expires_at                 bigint NOT NULL,
    created_at                 bigint NOT NULL,
    updated_at                 bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS matchmaking_queues_game_guild_status_idx
    ON matchmaking_queues (game, guild_id, status);
CREATE INDEX IF NOT EXISTS matchmaking_queues_game_captain_status_idx
    ON matchmaking_queues (game, captain_discord_user_id, status);
CREATE INDEX IF NOT EXISTS matchmaking_queues_game_status_created_idx
    ON matchmaking_queues (game, status, created_at);
CREATE INDEX IF NOT EXISTS matchmaking_queues_expires_at_idx
    ON matchmaking_queues (expires_at);

-- --------------------------------------------------------------------------
-- matchmaking_queue_participants  (was matchmaking_queue_players)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matchmaking_queue_participants (
    id                         serial PRIMARY KEY,
    game                       games   NOT NULL DEFAULT 'r6',
    queue_id                   integer NOT NULL REFERENCES matchmaking_queues(id) ON DELETE CASCADE,
    discord_user_id            text    NOT NULL,
    player_id                  integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    slot                       integer NOT NULL,
    username                   text    NOT NULL,
    platform                   text    NOT NULL,
    balance_rating             double precision NOT NULL,
    seed_rank_points           integer NOT NULL,
    seed_kd_ratio              double precision NOT NULL,
    seed_kost                  double precision NOT NULL,
    seed_kpr                   double precision NOT NULL,
    seed_headshot_percentage   double precision NOT NULL,
    seed_score                 double precision NOT NULL,
    created_at                 bigint  NOT NULL,
    updated_at                 bigint  NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS matchmaking_queue_participants_queue_user_unique
    ON matchmaking_queue_participants (queue_id, discord_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS matchmaking_queue_participants_queue_slot_unique
    ON matchmaking_queue_participants (queue_id, slot);
CREATE INDEX        IF NOT EXISTS matchmaking_queue_participants_player_idx
    ON matchmaking_queue_participants (player_id);
