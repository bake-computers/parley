-- Tournaments, ported from `main`-branch Drizzle with renames + game column.
--
-- Renames:
--     tournament_entries           -> tournament_teams
--     tournament_entry_players     -> tournament_team_rosters
--     tournament_bracket_matches   -> bracket_matches
--
-- bracket_matches.{winner_to_match_id, loser_to_match_id} are promoted from
-- free-form integers to real FK columns so we get referential integrity on
-- the bracket topology for free.

-- --------------------------------------------------------------------------
-- tournaments
-- --------------------------------------------------------------------------
CREATE TABLE tournaments (
    id                          serial  PRIMARY KEY,
    game                        games   NOT NULL DEFAULT 'r6',
    name                        text    NOT NULL,
    name_normalized             text    NOT NULL,
    format                      text    NOT NULL,
    team_cap                    integer NOT NULL,
    visibility                  text    NOT NULL DEFAULT 'public',
    status                      text    NOT NULL,
    created_by_guild_id         text    NOT NULL,
    created_by_channel_id       text    NOT NULL,
    created_by_discord_user_id  text    NOT NULL,
    hub_message_id              text,
    filled_at                   bigint,
    auto_start_at               bigint,
    started_at                  bigint,
    completed_at                bigint,
    -- winner_entry_id is a real FK *after* tournament_teams exists; set later.
    winner_entry_id             integer,
    created_at                  bigint  NOT NULL,
    updated_at                  bigint  NOT NULL
);
CREATE INDEX tournaments_game_name_lookup_idx
    ON tournaments (game, name_normalized);
CREATE INDEX tournaments_game_visibility_status_idx
    ON tournaments (game, visibility, status);
CREATE INDEX tournaments_game_auto_start_idx
    ON tournaments (game, status, auto_start_at);

-- --------------------------------------------------------------------------
-- tournament_teams  (was tournament_entries)
-- --------------------------------------------------------------------------
CREATE TABLE tournament_teams (
    id                         serial  PRIMARY KEY,
    game                       games   NOT NULL DEFAULT 'r6',
    tournament_id              integer NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    guild_id                   text    NOT NULL,
    channel_id                 text    NOT NULL,
    captain_discord_user_id    text    NOT NULL,
    team_name                  text    NOT NULL,
    team_name_normalized       text    NOT NULL,
    status                     text    NOT NULL,
    seed_number                integer,
    stack_balance_total        double precision NOT NULL,
    stack_balance_average      double precision NOT NULL,
    joined_at                  bigint  NOT NULL,
    eliminated_at              bigint,
    created_at                 bigint  NOT NULL,
    updated_at                 bigint  NOT NULL
);
CREATE UNIQUE INDEX tournament_teams_game_tournament_captain_unique
    ON tournament_teams (game, tournament_id, captain_discord_user_id);
CREATE UNIQUE INDEX tournament_teams_game_tournament_team_name_unique
    ON tournament_teams (game, tournament_id, team_name_normalized);
CREATE INDEX tournament_teams_tournament_status_idx
    ON tournament_teams (tournament_id, status);
CREATE INDEX tournament_teams_guild_idx
    ON tournament_teams (guild_id);

-- Now we can install the deferred FK on tournaments.winner_entry_id.
ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_winner_entry_fk
    FOREIGN KEY (winner_entry_id)
    REFERENCES tournament_teams(id) ON DELETE SET NULL;

-- --------------------------------------------------------------------------
-- tournament_team_rosters  (was tournament_entry_players)
-- --------------------------------------------------------------------------
CREATE TABLE tournament_team_rosters (
    id                         serial  PRIMARY KEY,
    game                       games   NOT NULL DEFAULT 'r6',
    tournament_id              integer NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id                    integer NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
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
CREATE UNIQUE INDEX tournament_team_rosters_team_slot_unique
    ON tournament_team_rosters (team_id, slot);
CREATE UNIQUE INDEX tournament_team_rosters_team_user_unique
    ON tournament_team_rosters (team_id, discord_user_id);
CREATE UNIQUE INDEX tournament_team_rosters_game_tournament_user_unique
    ON tournament_team_rosters (game, tournament_id, discord_user_id);
CREATE UNIQUE INDEX tournament_team_rosters_game_tournament_player_unique
    ON tournament_team_rosters (game, tournament_id, player_id);
CREATE INDEX tournament_team_rosters_player_idx
    ON tournament_team_rosters (player_id);

-- --------------------------------------------------------------------------
-- bracket_matches  (was tournament_bracket_matches)
-- --------------------------------------------------------------------------
CREATE TABLE bracket_matches (
    id                   serial  PRIMARY KEY,
    game                 games   NOT NULL DEFAULT 'r6',
    tournament_id        integer NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    bracket              text    NOT NULL,
    round_number         integer NOT NULL,
    match_number         integer NOT NULL,
    status               text    NOT NULL,
    team_a_id            integer REFERENCES tournament_teams(id) ON DELETE SET NULL,
    team_b_id            integer REFERENCES tournament_teams(id) ON DELETE SET NULL,
    winner_team_id       integer REFERENCES tournament_teams(id) ON DELETE SET NULL,
    loser_team_id        integer REFERENCES tournament_teams(id) ON DELETE SET NULL,
    -- Promoted to real FKs vs. main's loose int columns.
    winner_to_match_id   integer REFERENCES bracket_matches(id) ON DELETE SET NULL,
    winner_to_slot       text,
    loser_to_match_id    integer REFERENCES bracket_matches(id) ON DELETE SET NULL,
    loser_to_slot        text,
    custom_match_id      integer REFERENCES matches(id) ON DELETE SET NULL,
    created_at           bigint  NOT NULL,
    updated_at           bigint  NOT NULL
);
CREATE UNIQUE INDEX bracket_matches_game_tournament_round_match_unique
    ON bracket_matches (game, tournament_id, bracket, round_number, match_number);
CREATE INDEX bracket_matches_tournament_status_idx
    ON bracket_matches (tournament_id, status);
CREATE INDEX bracket_matches_custom_match_idx
    ON bracket_matches (custom_match_id);
