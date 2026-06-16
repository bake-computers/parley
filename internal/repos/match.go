package repos

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/parley-bot/parley/internal/models"
	"github.com/uptrace/bun"
)

// Queue status values for matchmaking_queues.
const (
	QueueStatusWaiting   = "waiting"
	QueueStatusMatched   = "matched"
	QueueStatusCancelled = "cancelled"
	QueueStatusExpired   = "expired"
)

// Match status values for matches.
const (
	MatchStatusPending   = "pending"
	MatchStatusActive    = "active"
	MatchStatusCompleted = "completed"
)

// MatchmakingQueueRepo provides access to matchmaking_queues and participants.
type MatchmakingQueueRepo struct {
	db *bun.DB
}

// NewMatchmakingQueueRepo returns a queue repository.
func NewMatchmakingQueueRepo(db *bun.DB) *MatchmakingQueueRepo {
	return &MatchmakingQueueRepo{db: db}
}

// CreateStack inserts a queue row and its participants in one transaction.
func (r *MatchmakingQueueRepo) CreateStack(
	ctx context.Context,
	row *models.NewMatchmakingQueue,
	participants []models.NewMatchmakingQueueParticipant,
) (*models.MatchmakingQueue, []models.MatchmakingQueueParticipant, error) {
	if row == nil {
		return nil, nil, fmt.Errorf("matchmaking queue row is nil")
	}
	var savedQueue models.MatchmakingQueue
	var savedParts []models.MatchmakingQueueParticipant
	err := r.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().
			Model(row).
			Returning("*").
			Exec(ctx, &savedQueue); err != nil {
			return err
		}
		savedParts = make([]models.MatchmakingQueueParticipant, 0, len(participants))
		for i := range participants {
			entry := participants[i]
			entry.QueueID = savedQueue.ID
			var part models.MatchmakingQueueParticipant
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
	return &savedQueue, savedParts, nil
}

// FindWaitingForPool returns waiting stacks for a guild pool ordered oldest first.
func (r *MatchmakingQueueRepo) FindWaitingForPool(
	ctx context.Context,
	game models.Game,
	guildID string,
	teamSize int32,
) ([]models.MatchmakingQueue, error) {
	var rows []models.MatchmakingQueue
	err := r.db.NewSelect().
		Model(&rows).
		Where("game = ?", game).
		Where("guild_id = ?", guildID).
		Where("team_size = ?", teamSize).
		Where("status = ?", QueueStatusWaiting).
		Order("created_at ASC").
		Scan(ctx)
	return rows, err
}

// ParticipantsForQueues loads participants for the given queue ids.
func (r *MatchmakingQueueRepo) ParticipantsForQueues(
	ctx context.Context,
	queueIDs []int32,
) ([]models.MatchmakingQueueParticipant, error) {
	if len(queueIDs) == 0 {
		return nil, nil
	}
	var rows []models.MatchmakingQueueParticipant
	err := r.db.NewSelect().
		Model(&rows).
		Where("queue_id IN (?)", bun.List(queueIDs)).
		Order("queue_id ASC", "slot ASC").
		Scan(ctx)
	return rows, err
}

// FindActiveForCaptain returns the waiting queue captained by the user, if any.
func (r *MatchmakingQueueRepo) FindActiveForCaptain(
	ctx context.Context,
	game models.Game,
	captainDiscordUserID string,
) (*models.MatchmakingQueue, error) {
	var row models.MatchmakingQueue
	err := r.db.NewSelect().
		Model(&row).
		Where("game = ?", game).
		Where("captain_discord_user_id = ?", captainDiscordUserID).
		Where("status = ?", QueueStatusWaiting).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// FindActiveForParticipant returns the waiting queue containing the user, if any.
func (r *MatchmakingQueueRepo) FindActiveForParticipant(
	ctx context.Context,
	game models.Game,
	discordUserID string,
) (*models.MatchmakingQueue, error) {
	var queueID int32
	err := r.db.NewSelect().
		Column("mq.id").
		TableExpr("matchmaking_queue_participants AS mqp").
		Join("INNER JOIN matchmaking_queues AS mq ON mq.id = mqp.queue_id").
		Where("mqp.game = ?", game).
		Where("mqp.discord_user_id = ?", discordUserID).
		Where("mq.status = ?", QueueStatusWaiting).
		Limit(1).
		Scan(ctx, &queueID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	var row models.MatchmakingQueue
	err = r.db.NewSelect().
		Model(&row).
		Where("id = ?", queueID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// MarkMatched sets waiting queues to matched and links the scrim match id.
func (r *MatchmakingQueueRepo) MarkMatched(
	ctx context.Context,
	queueIDs []int32,
	matchID int32,
) (int64, error) {
	if len(queueIDs) == 0 {
		return 0, nil
	}
	now := NowMS()
	res, err := r.db.NewUpdate().
		Model((*models.MatchmakingQueue)(nil)).
		Set("status = ?", QueueStatusMatched).
		Set("matched_match_id = ?", matchID).
		Set("updated_at = ?", now).
		Where("id IN (?)", bun.List(queueIDs)).
		Where("status = ?", QueueStatusWaiting).
		Exec(ctx)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// Cancel marks a waiting queue as cancelled and returns the row, or nil if not updated.
func (r *MatchmakingQueueRepo) Cancel(
	ctx context.Context,
	queueID int32,
) (*models.MatchmakingQueue, error) {
	now := NowMS()
	var out models.MatchmakingQueue
	res, err := r.db.NewUpdate().
		Model((*models.MatchmakingQueue)(nil)).
		Set("status = ?", QueueStatusCancelled).
		Set("updated_at = ?", now).
		Where("id = ?", queueID).
		Where("status = ?", QueueStatusWaiting).
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

// ExpireStale marks waiting queues past expires_at as expired.
func (r *MatchmakingQueueRepo) ExpireStale(ctx context.Context, now int64) (int64, error) {
	res, err := r.db.NewUpdate().
		Model((*models.MatchmakingQueue)(nil)).
		Set("status = ?", QueueStatusExpired).
		Set("updated_at = ?", now).
		Where("status = ?", QueueStatusWaiting).
		Where("expires_at < ?", now).
		Exec(ctx)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// QueuePoolKey is a (game, guild_id, team_size) tuple identifying a
// matchmaking pool. It is the return type of
// MatchmakingQueueRepo.DistinctWaitingPools and is consumed by the
// background sweeper.
type QueuePoolKey struct {
	Game     models.Game `bun:"game"`
	GuildID  string      `bun:"guild_id"`
	TeamSize int32       `bun:"team_size"`
}

// DistinctWaitingPools returns every unique (game, guild_id,
// team_size) tuple across all currently-waiting queue rows. The
// sweeper iterates the result to attempt match formation per pool.
// Mirrors the SELECT DISTINCT in run_once in src/matchmaking/sweeper.rs.
func (r *MatchmakingQueueRepo) DistinctWaitingPools(ctx context.Context) ([]QueuePoolKey, error) {
	var rows []QueuePoolKey
	err := r.db.NewSelect().
		ColumnExpr("DISTINCT game, guild_id, team_size").
		TableExpr("matchmaking_queues").
		Where("status = ?", QueueStatusWaiting).
		Scan(ctx, &rows)
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// PoolStats returns (waiting_players, waiting_stacks) for a pool.
func (r *MatchmakingQueueRepo) PoolStats(
	ctx context.Context,
	game models.Game,
	guildID string,
	teamSize int32,
) (waitingPlayers int32, waitingStacks int32, err error) {
	var counts []int32
	err = r.db.NewSelect().
		Column("player_count").
		Model((*models.MatchmakingQueue)(nil)).
		Where("game = ?", game).
		Where("guild_id = ?", guildID).
		Where("team_size = ?", teamSize).
		Where("status = ?", QueueStatusWaiting).
		Scan(ctx, &counts)
	if err != nil {
		return 0, 0, err
	}
	var sum int32
	for _, c := range counts {
		sum += c
	}
	return sum, int32(len(counts)), nil
}

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
