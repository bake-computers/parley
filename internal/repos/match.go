package repos

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/bake-computers/parley/internal/models"
	"github.com/uptrace/bun"
)

// Match status values for matches.
const (
	MatchStatusPending   = "pending"
	MatchStatusActive    = "active"
	MatchStatusCompleted = "completed"
)

// MatchRepo provides access to matches and match_participants.
type MatchRepo struct {
	db *bun.DB
}

// NewMatchRepo returns a match repository.
func NewMatchRepo(db *bun.DB) *MatchRepo {
	return &MatchRepo{db: db}
}

// Create inserts a match and its participants in one transaction.
func (r *MatchRepo) Create(
	ctx context.Context,
	row *models.NewMatch,
	participants []models.NewMatchParticipant,
) (*models.MatchRow, []models.MatchParticipant, error) {
	if row == nil {
		return nil, nil, fmt.Errorf("match row is nil")
	}
	var savedMatch models.MatchRow
	var savedParts []models.MatchParticipant
	err := r.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().
			Model(row).
			Returning("*").
			Exec(ctx, &savedMatch); err != nil {
			return err
		}
		savedParts = make([]models.MatchParticipant, 0, len(participants))
		for i := range participants {
			entry := participants[i]
			entry.MatchID = savedMatch.ID
			var part models.MatchParticipant
			if _, err := tx.NewInsert().
				Model(&entry).
				Returning("*").
				Exec(ctx, &part); err != nil {
				return err
			}
			savedParts = append(savedParts, part)
		}
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	return &savedMatch, savedParts, nil
}

// Get loads a match by id scoped to game.
func (r *MatchRepo) Get(
	ctx context.Context,
	game models.Game,
	matchID int32,
) (*models.MatchRow, error) {
	var row models.MatchRow
	err := r.db.NewSelect().
		Model(&row).
		Where("id = ?", matchID).
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

// Participants returns match participants with optional player username/platform.
func (r *MatchRepo) Participants(
	ctx context.Context,
	matchID int32,
) ([]models.MatchParticipantWithUsername, error) {
	var rows []models.MatchParticipantWithUsername
	err := r.db.NewSelect().
		ColumnExpr("mp.id").
		ColumnExpr("mp.game").
		ColumnExpr("mp.match_id").
		ColumnExpr("mp.discord_user_id").
		ColumnExpr("mp.player_id").
		ColumnExpr("mp.team").
		ColumnExpr("mp.slot").
		ColumnExpr("mp.seed_rank_points").
		ColumnExpr("mp.seed_kd_ratio").
		ColumnExpr("mp.seed_kost").
		ColumnExpr("mp.seed_kpr").
		ColumnExpr("mp.seed_headshot_percentage").
		ColumnExpr("mp.seed_score").
		ColumnExpr("mp.balance_rating").
		ColumnExpr("mp.kills").
		ColumnExpr("mp.deaths").
		ColumnExpr("mp.created_at").
		ColumnExpr("mp.updated_at").
		ColumnExpr("p.username").
		ColumnExpr("p.platform").
		TableExpr("match_participants AS mp").
		Join("LEFT JOIN players AS p ON p.id = mp.player_id").
		Where("mp.match_id = ?", matchID).
		Order("mp.team ASC", "mp.slot ASC").
		Scan(ctx, &rows)
	return rows, err
}

// ParticipantGuildIDsForMatch returns the distinct set of guild IDs
// (across all games) that have memberships for any participant in the
// match. Used by the notifier to build the participant_guild_ids
// payload field for cross-guild announcements.
func (r *MatchRepo) ParticipantGuildIDsForMatch(
	ctx context.Context,
	matchID int32,
) ([]string, error) {
	var ids []string
	err := r.db.NewSelect().
		ColumnExpr("DISTINCT gm.guild_id").
		TableExpr("match_participants AS mp").
		Join("INNER JOIN guild_memberships AS gm").
		JoinOn("gm.game = mp.game AND gm.player_id = mp.player_id").
		Where("mp.match_id = ?", matchID).
		OrderExpr("gm.guild_id ASC").
		Scan(ctx, &ids)
	return ids, err
}

// Complete marks a match completed with the winning team.
func (r *MatchRepo) Complete(
	ctx context.Context,
	game models.Game,
	matchID int32,
	winningTeam string,
) (*models.MatchRow, error) {
	now := NowMS()
	var out models.MatchRow
	res, err := r.db.NewUpdate().
		Model((*models.MatchRow)(nil)).
		Set("status = ?", MatchStatusCompleted).
		Set("winning_team = ?", winningTeam).
		Set("updated_at = ?", now).
		Where("id = ?", matchID).
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

// CountTodayForGuild counts matches created today (UTC) for a guild.
func (r *MatchRepo) CountTodayForGuild(
	ctx context.Context,
	game models.Game,
	guildID string,
) (int64, error) {
	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).UnixMilli()
	var count int64
	err := r.db.NewSelect().
		Model((*models.MatchRow)(nil)).
		ColumnExpr("COUNT(*)").
		Where("game = ?", game).
		Where("guild_id = ?", guildID).
		Where("created_at >= ?", startOfDay).
		Scan(ctx, &count)
	return count, err
}

// ListForGuild returns keyset-paginated matches for a guild, newest first.
func (r *MatchRepo) ListForGuild(
	ctx context.Context,
	game models.Game,
	guildID string,
	limit int64,
	cursor *KeysetCursor,
) ([]models.MatchRow, error) {
	q := r.db.NewSelect().
		Model((*models.MatchRow)(nil)).
		Where("game = ?", game).
		Where("guild_id = ?", guildID).
		Order("created_at DESC", "id DESC").
		Limit(int(limit))
	if cursor != nil {
		q = q.Where(
			"(created_at < ?) OR (created_at = ? AND id < ?)",
			cursor.CreatedAt, cursor.CreatedAt, cursor.ID,
		)
	}
	var rows []models.MatchRow
	err := q.Scan(ctx, &rows)
	return rows, err
}

// ListForUser returns keyset-paginated matches the user joined, newest first.
func (r *MatchRepo) ListForUser(
	ctx context.Context,
	game models.Game,
	discordUserID string,
	limit int64,
	cursor *KeysetCursor,
) ([]models.MatchRow, error) {
	q := r.db.NewSelect().
		Model((*models.MatchRow)(nil)).
		Join("INNER JOIN match_participants AS mp ON mp.match_id = m.id").
		Where("mp.game = ?", game).
		Where("mp.discord_user_id = ?", discordUserID).
		Order("m.created_at DESC", "m.id DESC").
		Limit(int(limit))
	if cursor != nil {
		q = q.Where(
			"(m.created_at < ?) OR (m.created_at = ? AND m.id < ?)",
			cursor.CreatedAt, cursor.CreatedAt, cursor.ID,
		)
	}
	var rows []models.MatchRow
	err := q.Scan(ctx, &rows)
	return rows, err
}

// GetByUUID loads a match by public UUID scoped to game.
func (r *MatchRepo) GetByUUID(
	ctx context.Context,
	game models.Game,
	publicUUID uuid.UUID,
) (*models.MatchRow, error) {
	var row models.MatchRow
	err := r.db.NewSelect().
		Model(&row).
		Where("game = ?", game).
		Where("public_uuid = ?", publicUUID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// KeysetCursor is the decoded pagination position for match list queries.
type KeysetCursor struct {
	CreatedAt int64
	ID        int32
}

// KeysetCursorFromString decodes an opaque cursor via DecodeCursor.
func KeysetCursorFromString(s string) (*KeysetCursor, error) {
	p, err := DecodeCursor(s)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, nil
	}
	return &KeysetCursor{CreatedAt: p.CreatedAt, ID: p.ID}, nil
}
