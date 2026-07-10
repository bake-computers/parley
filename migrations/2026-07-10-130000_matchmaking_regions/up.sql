ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS matchmaking_region smallint NOT NULL DEFAULT 0
        CHECK (matchmaking_region BETWEEN 0 AND 4);

ALTER TABLE matchmaking_queues
    ADD COLUMN IF NOT EXISTS matchmaking_region smallint NOT NULL DEFAULT 0
        CHECK (matchmaking_region BETWEEN 0 AND 4);

ALTER TABLE user_settings
    DROP COLUMN IF EXISTS timezone;

DROP INDEX IF EXISTS matchmaking_queues_game_guild_team_size_status_idx;
CREATE INDEX IF NOT EXISTS matchmaking_queues_game_guild_team_size_region_status_idx
    ON matchmaking_queues (game, guild_id, team_size, matchmaking_region, status);
