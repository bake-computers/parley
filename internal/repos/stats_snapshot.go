package repos

import (
	"context"
	"database/sql"
	"errors"

	"github.com/pactum-computers/parley/internal/models"
	"github.com/uptrace/bun"
)

// PlayerStatSnapshotRepo provides access to player_stat_snapshots.
type PlayerStatSnapshotRepo struct {
	db *bun.DB
}

// NewPlayerStatSnapshotRepo returns a snapshot repository backed by the
// given bun handle.
func NewPlayerStatSnapshotRepo(db *bun.DB) *PlayerStatSnapshotRepo {
	return &PlayerStatSnapshotRepo{db: db}
}

// LatestForPlayers returns the most recent stat snapshot for each player
// in the given id list, scoped to game. Snapshots with a later fetched_at
// win; ties resolve to the higher id. Players without a snapshot are
// omitted. Mirrors PlayerStatSnapshotRepo::latest_for_players in
// src/db/matchmaking_repos.rs.
func (r *PlayerStatSnapshotRepo) LatestForPlayers(
	ctx context.Context,
	game models.Game,
	playerIDs []int32,
) ([]models.PlayerStatSnapshot, error) {
	if len(playerIDs) == 0 {
		return nil, nil
	}
	var rows []models.PlayerStatSnapshot
	err := r.db.NewSelect().
		Model((*models.PlayerStatSnapshot)(nil)).
		ColumnExpr("DISTINCT ON (player_id) *").
		Where("game = ?", game).
		Where("player_id IN (?)", bun.List(playerIDs)).
		OrderExpr("player_id ASC, fetched_at DESC, id DESC").
		Scan(ctx, &rows)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return rows, nil
}

// Insert writes a new snapshot row. Mirrors PlayerStatSnapshotRepo::insert in
// src/db/repos.rs.
func (r *PlayerStatSnapshotRepo) Insert(
	ctx context.Context,
	row *models.NewPlayerStatSnapshot,
) (*models.PlayerStatSnapshot, error) {
	var out models.PlayerStatSnapshot
	_, err := r.db.NewInsert().
		Model(row).
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}
