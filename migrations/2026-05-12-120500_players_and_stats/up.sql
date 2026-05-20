-- Identity + stats tables.
-- Columns are 1-to-1 with `main`-branch Drizzle `players` + `stat_snapshots`
-- + `discord_accounts`, with:
--   * `game games NOT NULL DEFAULT 'r6'` added everywhere
--   * renames:
--       stat_snapshots    -> player_stat_snapshots
--       discord_accounts  -> discord_identities
--   * uniques rescoped by game so a Discord user can link one R6 AND one CS2
--     account simultaneously.

-- --------------------------------------------------------------------------
-- players
-- --------------------------------------------------------------------------
CREATE TABLE players (
    id                   serial PRIMARY KEY,
    game                 games            NOT NULL DEFAULT 'r6',
    profile_id           text,
    username             text             NOT NULL,
    username_normalized  text             NOT NULL,
    platform             text             NOT NULL,
    profile_url          text,
    level                integer          NOT NULL DEFAULT 0,
    internal_elo         double precision NOT NULL DEFAULT 1000,
    internal_matches     integer          NOT NULL DEFAULT 0,
    internal_wins        integer          NOT NULL DEFAULT 0,
    internal_losses      integer          NOT NULL DEFAULT 0,
    internal_updated_at  bigint,
    created_at           bigint           NOT NULL,
    updated_at           bigint           NOT NULL
);
-- profile_id is unique per-game when present.
CREATE UNIQUE INDEX players_game_profile_id_unique
    ON players (game, profile_id)
    WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX players_game_username_platform_unique
    ON players (game, username_normalized, platform);
CREATE INDEX players_game_internal_elo_idx
    ON players (game, internal_elo DESC);

-- --------------------------------------------------------------------------
-- discord_identities  (was discord_accounts)
-- --------------------------------------------------------------------------
CREATE TABLE discord_identities (
    id               serial PRIMARY KEY,
    game             games  NOT NULL DEFAULT 'r6',
    discord_user_id  text   NOT NULL,
    player_id        integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at       bigint NOT NULL,
    updated_at       bigint NOT NULL
);
CREATE UNIQUE INDEX discord_identities_game_discord_user_unique
    ON discord_identities (game, discord_user_id);
CREATE UNIQUE INDEX discord_identities_game_player_unique
    ON discord_identities (game, player_id);

-- --------------------------------------------------------------------------
-- player_stat_snapshots  (was stat_snapshots)
-- --------------------------------------------------------------------------
CREATE TABLE player_stat_snapshots (
    id                    serial PRIMARY KEY,
    player_id             integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    game                  games   NOT NULL DEFAULT 'r6',
    fetched_at            bigint  NOT NULL,
    source                text    NOT NULL,
    cache_version         integer NOT NULL,
    current_rank          text,
    rank_points           integer          NOT NULL DEFAULT 0,
    matches               integer          NOT NULL DEFAULT 0,
    wins                  integer          NOT NULL DEFAULT 0,
    losses                integer          NOT NULL DEFAULT 0,
    kills                 integer          NOT NULL DEFAULT 0,
    deaths                integer          NOT NULL DEFAULT 0,
    assists               integer          NOT NULL DEFAULT 0,
    headshots             integer          NOT NULL DEFAULT 0,
    kd_ratio              double precision NOT NULL DEFAULT 0,
    headshot_percentage   double precision NOT NULL DEFAULT 0,
    win_rate              double precision NOT NULL DEFAULT 0,
    kost                  double precision NOT NULL DEFAULT 0,
    metadata              jsonb,
    payload_json          text    NOT NULL,
    created_at            bigint  NOT NULL
);
-- Stats-cache hot-path index: "latest snapshot for (game, player_id)".
CREATE INDEX player_stat_snapshots_game_player_fetched_idx
    ON player_stat_snapshots (game, player_id, fetched_at DESC);

-- --------------------------------------------------------------------------
-- external_match_history (CS2 recent games; future-proof for any game upstream)
-- --------------------------------------------------------------------------
CREATE TABLE external_match_history (
    id                 serial  PRIMARY KEY,
    player_id          integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    game               games   NOT NULL,
    external_match_id  text    NOT NULL,
    played_at          bigint  NOT NULL,
    fetched_at         bigint  NOT NULL,
    metadata           jsonb,
    created_at         bigint  NOT NULL
);
CREATE UNIQUE INDEX external_match_history_game_player_match_unique
    ON external_match_history (game, player_id, external_match_id);
CREATE INDEX external_match_history_game_player_played_idx
    ON external_match_history (game, player_id, played_at DESC);
