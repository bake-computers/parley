-- R6-only: remove the legacy brawl_stars enum label (no rows may reference it).
UPDATE players SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE discord_identities SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE guild_memberships SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE guild_settings SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE guild_matchmaking_rules SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE guild_notification_settings SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE guild_match_quotas SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE player_stat_snapshots SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE match_queues SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE matches SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE match_participants SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE tournaments SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE tournament_teams SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE tournament_rosters SET game = 'r6'::games WHERE game = 'brawl_stars'::games;
UPDATE bracket_matches SET game = 'r6'::games WHERE game = 'brawl_stars'::games;

UPDATE external_match_history SET game = 'r6'::games WHERE game = 'brawl_stars'::games;

ALTER TYPE games RENAME VALUE 'brawl_stars' TO 'cs2';