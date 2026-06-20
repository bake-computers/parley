DROP INDEX IF EXISTS discord_identities_game_discord_user_idx;

CREATE UNIQUE INDEX IF NOT EXISTS discord_identities_game_discord_user_unique
    ON discord_identities (game, discord_user_id);