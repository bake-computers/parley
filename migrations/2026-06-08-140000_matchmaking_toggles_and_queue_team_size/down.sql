DROP INDEX IF EXISTS matchmaking_queues_game_guild_team_size_status_idx;

ALTER TABLE matchmaking_queues DROP COLUMN IF EXISTS team_size;
ALTER TABLE user_settings DROP COLUMN IF EXISTS matchmaking_enabled;
ALTER TABLE guild_settings DROP COLUMN IF EXISTS matchmaking_enabled;