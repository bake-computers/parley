-- Public profile identity cache, username redirect history, and Parley rating history.

CREATE TABLE IF NOT EXISTS discord_profiles (
    discord_user_id      text   PRIMARY KEY,
    username             text   NOT NULL,
    username_normalized  text   NOT NULL,
    global_name          text,
    avatar_hash          text,
    created_at           bigint NOT NULL,
    updated_at           bigint NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS discord_profiles_username_normalized_uidx
    ON discord_profiles (username_normalized);

-- Prior Discord handles for 301 redirects after rename (last-writer-wins on reclaim).
CREATE TABLE IF NOT EXISTS discord_username_history (
    id                   bigserial PRIMARY KEY,
    discord_user_id      text   NOT NULL,
    username             text   NOT NULL,
    username_normalized  text   NOT NULL,
    claimed_at           bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS discord_username_history_username_normalized_idx
    ON discord_username_history (username_normalized);

CREATE INDEX IF NOT EXISTS discord_username_history_user_idx
    ON discord_username_history (discord_user_id);

-- Absolute Parley rank over time (written on match result and elo seed).
CREATE TABLE IF NOT EXISTS rating_history (
    id                   bigserial PRIMARY KEY,
    discord_user_id      text             NOT NULL,
    game                 games            NOT NULL,
    player_id            integer          NOT NULL REFERENCES players (id),
    elo                  double precision NOT NULL,
    rating_deviation     double precision,
    delta                double precision,
    source               text             NOT NULL,
    match_id             integer          REFERENCES matches (id),
    recorded_at          bigint           NOT NULL
);

CREATE INDEX IF NOT EXISTS rating_history_user_game_recorded_idx
    ON rating_history (discord_user_id, game, recorded_at DESC);

CREATE INDEX IF NOT EXISTS rating_history_player_recorded_idx
    ON rating_history (player_id, recorded_at DESC);

-- Public profile match list + career K/D/A filter by discord_user_id (not match_id).
CREATE INDEX IF NOT EXISTS match_participants_discord_user_game_idx
    ON match_participants (discord_user_id, game);

-- One-shot backfill: reconstruct absolute elo-after-match from current elo and
-- reverse-ordered rating_delta on completed matches. Only for users with no
-- history rows yet (forward-compatible with engines already writing history).
INSERT INTO rating_history (
    discord_user_id,
    game,
    player_id,
    elo,
    delta,
    source,
    match_id,
    recorded_at
)
SELECT
    o.discord_user_id,
    o.game,
    o.player_id,
    o.current_elo - o.sum_newer_deltas AS elo,
    o.rating_delta,
    'match',
    o.match_id,
    o.created_at
FROM (
    SELECT
        mp.discord_user_id,
        mp.game,
        mp.player_id,
        mp.match_id,
        mp.rating_delta,
        m.created_at,
        p.internal_elo AS current_elo,
        COALESCE(
            SUM(mp.rating_delta) OVER (
                PARTITION BY mp.discord_user_id, mp.game
                ORDER BY m.created_at DESC, m.id DESC
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
        ) AS sum_newer_deltas
    FROM match_participants AS mp
    INNER JOIN matches AS m ON m.id = mp.match_id
    INNER JOIN players AS p ON p.id = mp.player_id
    WHERE m.status = 'completed'
      AND mp.rating_delta IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM rating_history AS rh
          WHERE rh.discord_user_id = mp.discord_user_id
            AND rh.game = mp.game
      )
) AS o;
