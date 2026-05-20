DROP TABLE IF EXISTS bracket_matches;
DROP TABLE IF EXISTS tournament_team_rosters;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_winner_entry_fk;
DROP TABLE IF EXISTS tournament_teams;
DROP TABLE IF EXISTS tournaments;
