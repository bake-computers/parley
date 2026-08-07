DROP INDEX IF EXISTS match_participants_discord_user_game_idx;

DROP INDEX IF EXISTS rating_history_player_recorded_idx;
DROP INDEX IF EXISTS rating_history_user_game_recorded_idx;
DROP TABLE IF EXISTS rating_history;

DROP INDEX IF EXISTS discord_username_history_user_idx;
DROP INDEX IF EXISTS discord_username_history_username_normalized_idx;
DROP TABLE IF EXISTS discord_username_history;

DROP INDEX IF EXISTS discord_profiles_username_normalized_uidx;
DROP TABLE IF EXISTS discord_profiles;
