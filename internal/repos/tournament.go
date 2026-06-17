package repos

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/parley-bot/parley/internal/models"
	"github.com/uptrace/bun"
)

// Tournament lifecycle status values.
const (
	TournamentStatusOpen       = "open"
	TournamentStatusInProgress = "in_progress"
	TournamentStatusCompleted  = "completed"
	TournamentStatusCancelled  = "cancelled"
)

// Tournament team status values.
const (
	TeamStatusRegistered = "registered"
	TeamStatusActive     = "active"
	TeamStatusEliminated = "eliminated"
	TeamStatusWithdrawn  = "withdrawn"
)

// Bracket match status values.
const (
	BracketStatusPending    = "pending"
	BracketStatusReady      = "ready"
	BracketStatusInProgress = "in_progress"
	BracketStatusCompleted  = "completed"
)

// NormalizeUsername trims and lowercases a display name for stable lookups.
func NormalizeUsername(u string) string {
	return strings.ToLower(strings.TrimSpace(u))
}

// TournamentRepo provides access to the tournaments table.
type TournamentRepo struct {
	db *bun.DB
}

// NewTournamentRepo returns a repository backed by the given bun handle.
func NewTournamentRepo(db *bun.DB) *TournamentRepo {
	return &TournamentRepo{db: db}
}

// Create inserts a tournament row and returns the persisted record.
func (r *TournamentRepo) Create(ctx context.Context, row *models.NewTournament) (*models.Tournament, error) {
	if row == nil {
		return nil, fmt.Errorf("tournament row is nil")
	}
	var out models.Tournament
	_, err := r.db.NewInsert().
		Model(row).
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Get loads a tournament by id scoped to game.
func (r *TournamentRepo) Get(
	ctx context.Context,
	game models.Game,
	tournamentID int32,
) (*models.Tournament, error) {
	var row models.Tournament
	err := r.db.NewSelect().
		Model(&row).
		Where("id = ?", tournamentID).
		Where("game = ?", game).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// ListForGuild returns tournaments created by a guild, newest first.
func (r *TournamentRepo) ListForGuild(
	ctx context.Context,
	game models.Game,
	guildID string,
	status *string,
	limit int,
) ([]models.Tournament, error) {
	q := r.db.NewSelect().
		Model((*models.Tournament)(nil)).
		Where("game = ?", game).
		Where("created_by_guild_id = ?", guildID)
	if status != nil && *status != "" {
		q = q.Where("status = ?", *status)
	}
	var rows []models.Tournament
	err := q.
		Order("created_at DESC").
		Limit(limit).
		Scan(ctx, &rows)
	return rows, err
}

// ParticipantGuildIDs returns the distinct set of guild IDs that
// have teams registered in the tournament, plus the host guild.
// Used by the notifier to build the participant_guild_ids payload
// for cross-guild announcements.
func (r *TournamentRepo) ParticipantGuildIDs(
	ctx context.Context,
	tournamentID int32,
) ([]string, error) {
	var ids []string
	err := r.db.NewSelect().
		ColumnExpr("DISTINCT guild_id").
		TableExpr("tournament_teams").
		Where("tournament_id = ?", tournamentID).
		OrderExpr("guild_id ASC").
		Scan(ctx, &ids)
	return ids, err
}

// UpdateStatus updates tournament lifecycle fields and returns the row, or nil if missing.
func (r *TournamentRepo) UpdateStatus(
	ctx context.Context,
	game models.Game,
	tournamentID int32,
	status string,
	startedAt, completedAt *int64,
	winnerEntryID *int32,
) (*models.Tournament, error) {
	now := NowMS()
	var out models.Tournament
	res, err := r.db.NewUpdate().
		Model((*models.Tournament)(nil)).
		Set("status = ?", status).
		Set("started_at = ?", startedAt).
		Set("completed_at = ?", completedAt).
		Set("winner_entry_id = ?", winnerEntryID).
		Set("updated_at = ?", now).
		Where("id = ?", tournamentID).
		Where("game = ?", game).
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, nil
	}
	return &out, nil
}

// TournamentTeamRepo provides access to tournament_teams.
type TournamentTeamRepo struct {
	db *bun.DB
}

// NewTournamentTeamRepo returns a team repository.
func NewTournamentTeamRepo(db *bun.DB) *TournamentTeamRepo {
	return &TournamentTeamRepo{db: db}
}

// Register inserts a team and its roster in one transaction.
func (r *TournamentTeamRepo) Register(
	ctx context.Context,
	team *models.NewTournamentTeam,
	roster []models.NewTournamentTeamRoster,
) (*models.TournamentTeam, []models.TournamentTeamRoster, error) {
	if team == nil {
		return nil, nil, fmt.Errorf("tournament team row is nil")
	}
	var savedTeam models.TournamentTeam
	var savedRoster []models.TournamentTeamRoster
	err := r.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().
			Model(team).
			Returning("*").
			Exec(ctx, &savedTeam); err != nil {
			return err
		}
		savedRoster = make([]models.TournamentTeamRoster, 0, len(roster))
		for i := range roster {
			entry := roster[i]
			entry.TeamID = savedTeam.ID
			var row models.TournamentTeamRoster
			if _, err := tx.NewInsert().
				Model(&entry).
				Returning("*").
				Exec(ctx, &row); err != nil {
				return err
			}
			savedRoster = append(savedRoster, row)
		}
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	return &savedTeam, savedRoster, nil
}

// ListForTournament returns non-withdrawn teams ordered by seed.
func (r *TournamentTeamRepo) ListForTournament(
	ctx context.Context,
	tournamentID int32,
) ([]models.TournamentTeam, error) {
	var rows []models.TournamentTeam
	err := r.db.NewSelect().
		Model(&rows).
		Where("tournament_id = ?", tournamentID).
		Where("status <> ?", TeamStatusWithdrawn).
		Order("seed_number ASC").
		Scan(ctx)
	return rows, err
}

// Get loads a team by id scoped to game.
func (r *TournamentTeamRepo) Get(
	ctx context.Context,
	game models.Game,
	teamID int32,
) (*models.TournamentTeam, error) {
	var row models.TournamentTeam
	err := r.db.NewSelect().
		Model(&row).
		Where("id = ?", teamID).
		Where("game = ?", game).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// Withdraw marks a team as withdrawn.
func (r *TournamentTeamRepo) Withdraw(
	ctx context.Context,
	game models.Game,
	teamID int32,
) (*models.TournamentTeam, error) {
	now := NowMS()
	var out models.TournamentTeam
	res, err := r.db.NewUpdate().
		Model((*models.TournamentTeam)(nil)).
		Set("status = ?", TeamStatusWithdrawn).
		Set("updated_at = ?", now).
		Where("id = ?", teamID).
		Where("game = ?", game).
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, nil
	}
	return &out, nil
}

// UpdateSeeds sets seed number and status for a team.
func (r *TournamentTeamRepo) UpdateSeeds(
	ctx context.Context,
	teamID int32,
	seedNumber int32,
	status string,
) error {
	now := NowMS()
	_, err := r.db.NewUpdate().
		Model((*models.TournamentTeam)(nil)).
		Set("seed_number = ?", seedNumber).
		Set("status = ?", status).
		Set("updated_at = ?", now).
		Where("id = ?", teamID).
		Exec(ctx)
	return err
}

// Eliminate marks a team eliminated with a timestamp.
func (r *TournamentTeamRepo) Eliminate(ctx context.Context, teamID int32) error {
	now := NowMS()
	_, err := r.db.NewUpdate().
		Model((*models.TournamentTeam)(nil)).
		Set("status = ?", TeamStatusEliminated).
		Set("eliminated_at = ?", now).
		Set("updated_at = ?", now).
		Where("id = ?", teamID).
		Exec(ctx)
	return err
}

// NormalizeTeamName normalizes a team display name for uniqueness checks.
func NormalizeTeamName(name string) string {
	return NormalizeUsername(name)
}

// TournamentRosterRepo provides access to tournament_team_rosters.
type TournamentRosterRepo struct {
	db *bun.DB
}

// NewTournamentRosterRepo returns a roster repository.
func NewTournamentRosterRepo(db *bun.DB) *TournamentRosterRepo {
	return &TournamentRosterRepo{db: db}
}

// ForTeam returns roster rows for a team ordered by slot.
func (r *TournamentRosterRepo) ForTeam(
	ctx context.Context,
	teamID int32,
) ([]models.TournamentTeamRoster, error) {
	var rows []models.TournamentTeamRoster
	err := r.db.NewSelect().
		Model(&rows).
		Where("team_id = ?", teamID).
		Order("slot ASC").
		Scan(ctx)
	return rows, err
}

// ForTournament returns all roster rows for a tournament.
func (r *TournamentRosterRepo) ForTournament(
	ctx context.Context,
	tournamentID int32,
) ([]models.TournamentTeamRoster, error) {
	var rows []models.TournamentTeamRoster
	err := r.db.NewSelect().
		Model(&rows).
		Where("tournament_id = ?", tournamentID).
		Order("team_id ASC", "slot ASC").
		Scan(ctx)
	return rows, err
}

// ReplaceForTeam deletes existing roster rows and inserts the new set.
func (r *TournamentRosterRepo) ReplaceForTeam(
	ctx context.Context,
	teamID int32,
	roster []models.NewTournamentTeamRoster,
) ([]models.TournamentTeamRoster, error) {
	var saved []models.TournamentTeamRoster
	err := r.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewDelete().
			Model((*models.TournamentTeamRoster)(nil)).
			Where("team_id = ?", teamID).
			Exec(ctx); err != nil {
			return err
		}
		saved = make([]models.TournamentTeamRoster, 0, len(roster))
		for i := range roster {
			entry := roster[i]
			var row models.TournamentTeamRoster
			if _, err := tx.NewInsert().
				Model(&entry).
				Returning("*").
				Exec(ctx, &row); err != nil {
				return err
			}
			saved = append(saved, row)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return saved, nil
}

// BracketMatchRepo provides access to bracket_matches.
type BracketMatchRepo struct {
	db *bun.DB
}

// NewBracketMatchRepo returns a bracket match repository.
func NewBracketMatchRepo(db *bun.DB) *BracketMatchRepo {
	return &BracketMatchRepo{db: db}
}

// InsertBatch inserts bracket matches one at a time and returns saved rows.
func (r *BracketMatchRepo) InsertBatch(
	ctx context.Context,
	rows []models.NewBracketMatch,
) ([]models.BracketMatch, error) {
	saved := make([]models.BracketMatch, 0, len(rows))
	for i := range rows {
		var m models.BracketMatch
		if _, err := r.db.NewInsert().
			Model(&rows[i]).
			Returning("*").
			Exec(ctx, &m); err != nil {
			return nil, err
		}
		saved = append(saved, m)
	}
	return saved, nil
}

// ListForTournament returns bracket matches in bracket/round/match order.
func (r *BracketMatchRepo) ListForTournament(
	ctx context.Context,
	tournamentID int32,
) ([]models.BracketMatch, error) {
	var rows []models.BracketMatch
	err := r.db.NewSelect().
		Model(&rows).
		Where("tournament_id = ?", tournamentID).
		Order("bracket ASC", "round_number ASC", "match_number ASC").
		Scan(ctx)
	return rows, err
}

// Get loads a bracket match by id scoped to game.
func (r *BracketMatchRepo) Get(
	ctx context.Context,
	game models.Game,
	bracketMatchID int32,
) (*models.BracketMatch, error) {
	var row models.BracketMatch
	err := r.db.NewSelect().
		Model(&row).
		Where("id = ?", bracketMatchID).
		Where("game = ?", game).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// UpdateResult records winner/loser and marks the match completed.
func (r *BracketMatchRepo) UpdateResult(
	ctx context.Context,
	bracketMatchID int32,
	winnerTeamID, loserTeamID int32,
) (*models.BracketMatch, error) {
	now := NowMS()
	var out models.BracketMatch
	res, err := r.db.NewUpdate().
		Model((*models.BracketMatch)(nil)).
		Set("status = ?", BracketStatusCompleted).
		Set("winner_team_id = ?", winnerTeamID).
		Set("loser_team_id = ?", loserTeamID).
		Set("updated_at = ?", now).
		Where("id = ?", bracketMatchID).
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, nil
	}
	return &out, nil
}

// SetTeamSlot assigns team A or B on a bracket match.
func (r *BracketMatchRepo) SetTeamSlot(
	ctx context.Context,
	bracketMatchID int32,
	slot string,
	teamID int32,
) error {
	now := NowMS()
	q := r.db.NewUpdate().
		Model((*models.BracketMatch)(nil)).
		Set("updated_at = ?", now).
		Where("id = ?", bracketMatchID)
	if slot == "a" {
		q = q.Set("team_a_id = ?", teamID)
	} else {
		q = q.Set("team_b_id = ?", teamID)
	}
	_, err := q.Exec(ctx)
	return err
}

// SetCustomMatch links a bracket row to a custom match and marks in progress.
func (r *BracketMatchRepo) SetCustomMatch(
	ctx context.Context,
	bracketMatchID int32,
	customMatchID int32,
) error {
	now := NowMS()
	_, err := r.db.NewUpdate().
		Model((*models.BracketMatch)(nil)).
		Set("custom_match_id = ?", customMatchID).
		Set("status = ?", BracketStatusInProgress).
		Set("updated_at = ?", now).
		Where("id = ?", bracketMatchID).
		Exec(ctx)
	return err
}

// MarkReadyWhenBothTeams promotes pending matches to ready when both slots are filled.
func (r *BracketMatchRepo) MarkReadyWhenBothTeams(ctx context.Context, bracketMatchID int32) error {
	var bm models.BracketMatch
	if err := r.db.NewSelect().
		Model(&bm).
		Where("id = ?", bracketMatchID).
		Scan(ctx); err != nil {
		return err
	}
	if bm.TeamAID == nil || bm.TeamBID == nil || bm.Status != BracketStatusPending {
		return nil
	}
	now := NowMS()
	_, err := r.db.NewUpdate().
		Model((*models.BracketMatch)(nil)).
		Set("status = ?", BracketStatusReady).
		Set("updated_at = ?", now).
		Where("id = ?", bracketMatchID).
		Exec(ctx)
	return err
}
