-- Remove the matchmaking queue system (queues + participants).
-- Queueless matchmaking stays: team building, custom matches,
-- eligibility rules, guild_matchmaking_rules, and the
-- matchmaking_enabled toggles are all retained.
DROP TABLE IF EXISTS matchmaking_queue_participants;
DROP TABLE IF EXISTS matchmaking_queues;

-- Dead table from the retired Vessel engine; zero code references.
DROP TABLE IF EXISTS vessel_sessions;

-- Queue-only user preference; queueless matchmaking has no region concept.
ALTER TABLE user_settings DROP COLUMN IF EXISTS matchmaking_region;
