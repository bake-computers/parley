package repos

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/bake-computers/parley/internal/models"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/uptrace/bun"
)

// parkedUsernamePrefix is used when last-writer-wins evicts a handle holder.
// Synthetic names are never served on the public profile surface.
const parkedUsernamePrefix = "parked_"

// ProfileRepo provides access to discord_profiles, username history, and rating_history.
type ProfileRepo struct {
	db *bun.DB
}

// NewProfileRepo returns a repository backed by the given bun handle.
func NewProfileRepo(db *bun.DB) *ProfileRepo {
	return &ProfileRepo{db: db}
}

// NormalizeDiscordUsername trims a leading @ and lowercases for lookups.
func NormalizeDiscordUsername(username string) string {
	u := strings.TrimSpace(username)
	u = strings.TrimPrefix(u, "@")
	return strings.ToLower(u)
}

// IsParkedDiscordUsername reports synthetic eviction handles.
func IsParkedDiscordUsername(username string) bool {
	return strings.HasPrefix(NormalizeDiscordUsername(username), parkedUsernamePrefix)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// UpsertDiscordProfile caches Discord identity and records prior handles for redirects.
// Last-writer-wins: if username_normalized is held by another user, that row is
// parked under a synthetic handle until they log in again.
func (r *ProfileRepo) UpsertDiscordProfile(
	ctx context.Context,
	discordUserID, username, globalName, avatarHash string,
) error {
	discordUserID = strings.TrimSpace(discordUserID)
	username = strings.TrimSpace(username)
	if discordUserID == "" || username == "" {
		return fmt.Errorf("discord_user_id and username are required")
	}
	normalized := NormalizeDiscordUsername(username)
	if normalized == "" {
		return fmt.Errorf("username is empty after normalize")
	}

	var globalNamePtr *string
	if g := strings.TrimSpace(globalName); g != "" {
		globalNamePtr = &g
	}
	var avatarPtr *string
	if a := strings.TrimSpace(avatarHash); a != "" {
		avatarPtr = &a
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		now := NowMS()
		lastErr = r.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
			return r.upsertDiscordProfileTx(
				ctx, tx, discordUserID, username, normalized, globalNamePtr, avatarPtr, now,
			)
		})
		if lastErr == nil {
			return nil
		}
		if !isUniqueViolation(lastErr) {
			return lastErr
		}
	}
	return lastErr
}

func (r *ProfileRepo) upsertDiscordProfileTx(
	ctx context.Context,
	tx bun.Tx,
	discordUserID, username, normalized string,
	globalNamePtr, avatarPtr *string,
	now int64,
) error {
	var existing models.DiscordProfile
	err := tx.NewSelect().
		Model(&existing).
		Where("discord_user_id = ?", discordUserID).
		Scan(ctx)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	hadExisting := err == nil

	// Evict another user currently holding this handle (last-writer-wins).
	var holder models.DiscordProfile
	holderErr := tx.NewSelect().
		Model(&holder).
		Where("username_normalized = ?", normalized).
		Where("discord_user_id <> ?", discordUserID).
		Scan(ctx)
	if holderErr == nil {
		// Park under a unique temporary handle; they recover on next OAuth upsert.
		parked := parkedUsernamePrefix + holder.DiscordUserID
		if _, err := tx.NewUpdate().
			Model((*models.DiscordProfile)(nil)).
			Set("username = ?", parked).
			Set("username_normalized = ?", parked).
			Set("updated_at = ?", now).
			Where("discord_user_id = ?", holder.DiscordUserID).
			Exec(ctx); err != nil {
			return err
		}
		// Only record real handles in redirect history.
		if !IsParkedDiscordUsername(holder.Username) {
			if _, err := tx.NewInsert().
				Model(&models.NewDiscordUsernameHistory{
					DiscordUserID:      holder.DiscordUserID,
					Username:           holder.Username,
					UsernameNormalized: holder.UsernameNormalized,
					ClaimedAt:          now,
				}).
				Exec(ctx); err != nil {
				return err
			}
		}
	} else if !errors.Is(holderErr, sql.ErrNoRows) {
		return holderErr
	}

	// Record prior real handle for redirects; skip synthetic parked names.
	if hadExisting &&
		existing.UsernameNormalized != normalized &&
		!IsParkedDiscordUsername(existing.Username) {
		if _, err := tx.NewInsert().
			Model(&models.NewDiscordUsernameHistory{
				DiscordUserID:      existing.DiscordUserID,
				Username:           existing.Username,
				UsernameNormalized: existing.UsernameNormalized,
				ClaimedAt:          now,
			}).
			Exec(ctx); err != nil {
			return err
		}
	}

	row := models.NewDiscordProfile{
		DiscordUserID:      discordUserID,
		Username:           username,
		UsernameNormalized: normalized,
		GlobalName:         globalNamePtr,
		AvatarHash:         avatarPtr,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	_, err = tx.NewInsert().
		Model(&row).
		On("CONFLICT (discord_user_id) DO UPDATE").
		Set("username = EXCLUDED.username").
		Set("username_normalized = EXCLUDED.username_normalized").
		Set("global_name = EXCLUDED.global_name").
		Set("avatar_hash = EXCLUDED.avatar_hash").
		Set("updated_at = EXCLUDED.updated_at").
		Exec(ctx)
	return err
}

// FindDiscordProfileByUsername loads a profile by normalized Discord username.
// Synthetic parked handles are treated as not found so they never become public URLs.
func (r *ProfileRepo) FindDiscordProfileByUsername(
	ctx context.Context,
	username string,
) (*models.DiscordProfile, error) {
	normalized := NormalizeDiscordUsername(username)
	if normalized == "" || IsParkedDiscordUsername(normalized) {
		return nil, nil
	}
	var row models.DiscordProfile
	err := r.db.NewSelect().
		Model(&row).
		Where("username_normalized = ?", normalized).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if IsParkedDiscordUsername(row.Username) {
		return nil, nil
	}
	return &row, nil
}

// FindDiscordProfile loads a profile by discord user id.
func (r *ProfileRepo) FindDiscordProfile(
	ctx context.Context,
	discordUserID string,
) (*models.DiscordProfile, error) {
	var row models.DiscordProfile
	err := r.db.NewSelect().
		Model(&row).
		Where("discord_user_id = ?", discordUserID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// FindLatestUsernameHistoryOwner returns the most recent user who claimed a handle.
func (r *ProfileRepo) FindLatestUsernameHistoryOwner(
	ctx context.Context,
	username string,
) (discordUserID string, err error) {
	normalized := NormalizeDiscordUsername(username)
	if normalized == "" {
		return "", nil
	}
	err = r.db.NewSelect().
		Model((*models.DiscordUsernameHistory)(nil)).
		Column("discord_user_id").
		Where("username_normalized = ?", normalized).
		Order("claimed_at DESC", "id DESC").
		Limit(1).
		Scan(ctx, &discordUserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return discordUserID, nil
}

// InsertRatingHistoryTx appends a rating history point inside an existing tx.
func InsertRatingHistoryTx(ctx context.Context, tx bun.Tx, row *models.NewRatingHistory) error {
	if row == nil {
		return fmt.Errorf("rating history row is nil")
	}
	_, err := tx.NewInsert().Model(row).Exec(ctx)
	return err
}

// ListRatingHistory returns rating points oldest→newest for charting.
func (r *ProfileRepo) ListRatingHistory(
	ctx context.Context,
	game models.Game,
	discordUserID string,
	limit int,
) ([]models.RatingHistory, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	// Fetch newest first then reverse so the chart left→right is chronological.
	var newestFirst []models.RatingHistory
	err := r.db.NewSelect().
		Model(&newestFirst).
		Where("game = ?", game).
		Where("discord_user_id = ?", discordUserID).
		Order("recorded_at DESC", "id DESC").
		Limit(limit).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(newestFirst)-1; i < j; i, j = i+1, j-1 {
		newestFirst[i], newestFirst[j] = newestFirst[j], newestFirst[i]
	}
	return newestFirst, nil
}

// CareerStatsFromMatches aggregates K/D/A across completed matches for a user.
func (r *ProfileRepo) CareerStatsFromMatches(
	ctx context.Context,
	game models.Game,
	discordUserID string,
) (*models.PlayerCareerStats, error) {
	var out models.PlayerCareerStats
	err := r.db.NewSelect().
		ColumnExpr("COALESCE(SUM(mp.kills), 0) AS kills").
		ColumnExpr("COALESCE(SUM(mp.deaths), 0) AS deaths").
		ColumnExpr("COALESCE(SUM(mp.assists), 0) AS assists").
		TableExpr("match_participants AS mp").
		Join("INNER JOIN matches AS m ON m.id = mp.match_id").
		Where("mp.game = ?", game).
		Where("mp.discord_user_id = ?", discordUserID).
		Where("m.status = ?", "completed").
		Scan(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// ListDiscordProfilesByIDs loads cached Discord profiles for a set of user ids.
func (r *ProfileRepo) ListDiscordProfilesByIDs(
	ctx context.Context,
	ids []string,
) (map[string]models.DiscordProfile, error) {
	out := make(map[string]models.DiscordProfile, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	var rows []models.DiscordProfile
	err := r.db.NewSelect().
		Model(&rows).
		Where("discord_user_id IN (?)", bun.In(ids)).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.DiscordUserID] = row
	}
	return out, nil
}

// DeleteDiscordProfileData removes profile cache + history for GDPR anonymization.
// Works with a transaction or the repo's primary handle when tx is nil.
func DeleteDiscordProfileData(ctx context.Context, idb bun.IDB, discordUserID string) error {
	if _, err := idb.NewDelete().
		Model((*models.DiscordUsernameHistory)(nil)).
		Where("discord_user_id = ?", discordUserID).
		Exec(ctx); err != nil {
		return err
	}
	if _, err := idb.NewDelete().
		Model((*models.RatingHistory)(nil)).
		Where("discord_user_id = ?", discordUserID).
		Exec(ctx); err != nil {
		return err
	}
	_, err := idb.NewDelete().
		Model((*models.DiscordProfile)(nil)).
		Where("discord_user_id = ?", discordUserID).
		Exec(ctx)
	return err
}
