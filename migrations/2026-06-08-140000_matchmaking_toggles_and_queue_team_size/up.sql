ALTER TABLE guild_settings
    ADD COLUMN matchmaking_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE user_settings
    ADD COLUMN matchmaking_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE matchmaking_queues
    ADD COLUMN team_size integer NOT NULL DEFAULT 5;

CREATE INDEX matchmaking_queues_game_guild_team_size_status_idx
    ON matchmaking_queues (game, guild_id, team_size, status);