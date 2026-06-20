-- Allow one Discord user to link multiple R6 players (e.g. PC + console).
DROP INDEX IF EXISTS discord_identities_game_discord_user_unique;

CREATE INDEX IF NOT EXISTS discord_identities_game_discord_user_idx
    ON discord_identities (game, discord_user_id);