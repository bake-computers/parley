DROP INDEX IF EXISTS matchmaking_queues_game_guild_team_size_region_status_idx;

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE matchmaking_queues
    DROP COLUMN IF EXISTS matchmaking_region;

ALTER TABLE user_settings
    DROP COLUMN IF EXISTS matchmaking_region;

CREATE INDEX IF NOT EXISTS matchmaking_queues_game_guild_team_size_status_idx
    ON matchmaking_queues (game, guild_id, team_size, status);
