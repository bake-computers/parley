-- Best-effort schema recreation for rollback; dropped data is not restored.

CREATE TABLE IF NOT EXISTS matchmaking_queues (
    id                         serial PRIMARY KEY,
    game                       games  NOT NULL DEFAULT 'r6',
    guild_id                   text   NOT NULL,
    channel_id                 text   NOT NULL,
    captain_discord_user_id    text   NOT NULL,
    status                     text   NOT NULL,
    player_count               integer NOT NULL,
    stack_balance_total        double precision NOT NULL,
    stack_balance_average      double precision NOT NULL,
    matched_match_id           integer REFERENCES matches(id) ON DELETE SET NULL,
    expires_at                 bigint NOT NULL,
    created_at                 bigint NOT NULL,
    updated_at                 bigint NOT NULL,
    team_size                  integer NOT NULL DEFAULT 5,
    matchmaking_region         smallint NOT NULL DEFAULT 0
        CHECK (matchmaking_region BETWEEN 0 AND 4)
);

CREATE TABLE IF NOT EXISTS matchmaking_queue_participants (
    id                         serial PRIMARY KEY,
    game                       games   NOT NULL DEFAULT 'r6',
    queue_id                   integer NOT NULL REFERENCES matchmaking_queues(id) ON DELETE CASCADE,
    discord_user_id            text    NOT NULL,
    player_id                  integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    slot                       integer NOT NULL,
    username                   text    NOT NULL,
    platform                   text    NOT NULL,
    balance_rating             double precision NOT NULL,
    seed_rank_points           integer NOT NULL,
    seed_kd_ratio              double precision NOT NULL,
    seed_kost                  double precision NOT NULL,
    seed_kpr                   double precision NOT NULL,
    seed_headshot_percentage   double precision NOT NULL,
    seed_score                 double precision NOT NULL,
    created_at                 bigint  NOT NULL,
    updated_at                 bigint  NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS matchmaking_queue_participants_queue_user_unique
    ON matchmaking_queue_participants (queue_id, discord_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS matchmaking_queue_participants_queue_slot_unique
    ON matchmaking_queue_participants (queue_id, slot);
CREATE INDEX        IF NOT EXISTS matchmaking_queue_participants_player_idx
    ON matchmaking_queue_participants (player_id);

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

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS matchmaking_region smallint NOT NULL DEFAULT 0
        CHECK (matchmaking_region BETWEEN 0 AND 4);
