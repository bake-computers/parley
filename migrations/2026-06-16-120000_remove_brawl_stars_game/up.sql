-- R6-only: remove the legacy brawl_stars enum label (no rows may reference it).
-- The whole block is guarded by label existence so a replay is a no-op and the
-- rename can't trip on a value that's already been renamed back to 'cs2'.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'games' AND e.enumlabel = 'brawl_stars'
    ) THEN
        UPDATE players                    SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE discord_identities         SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE guild_memberships          SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE guild_settings             SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE guild_matchmaking_rules    SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE guild_notification_settings SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE guild_match_quotas         SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE player_stat_snapshots      SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE matchmaking_queues         SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE matches                    SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE match_participants         SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE tournaments                SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE tournament_teams           SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE tournament_team_rosters    SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
        UPDATE bracket_matches            SET game = 'r6'::games WHERE game = 'brawl_stars'::games;

        UPDATE external_match_history     SET game = 'r6'::games WHERE game = 'brawl_stars'::games;

        ALTER TYPE games RENAME VALUE 'brawl_stars' TO 'cs2';
    END IF;
END $$;
