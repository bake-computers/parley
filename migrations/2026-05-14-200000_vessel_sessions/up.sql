-- Vessel session tracking for the Vessel Rust engine.
-- Each row represents a single matchmaking/purge session run.

CREATE TABLE IF NOT EXISTS vessel_sessions (
    id                  serial PRIMARY KEY,
    session_id          uuid   NOT NULL UNIQUE,
    started_at          timestamptz NOT NULL DEFAULT NOW(),
    status              text   NOT NULL DEFAULT 'active',
    seed_player         text   NOT NULL,
    players_discovered  integer NOT NULL DEFAULT 0,
    players_inserted    integer NOT NULL DEFAULT 0,
    interactions_sent   integer NOT NULL DEFAULT 0
);