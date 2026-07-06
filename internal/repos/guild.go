package repos

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/pactum-computers/parley/internal/models"
	"github.com/uptrace/bun"
)

// DeletionCooldownMS is the thirty-day re-registration ban after GDPR deletion.
const DeletionCooldownMS int64 = 30 * 24 * 60 * 60 * 1000

// UnlinkCooldownMS is the wait before linking again after a voluntary delink.
const UnlinkCooldownMS int64 = 24 * 60 * 60 * 1000

// GuildMemberRow is a joined guild membership and player identity row.
type GuildMemberRow struct {
	DiscordUserID   string  `bun:"discord_user_id"`
	PlayerID        int32   `bun:"player_id"`
	InternalElo     float64 `bun:"internal_elo"`
	RatingDeviation float64 `bun:"rating_deviation"`
	Username        string  `bun:"username"`
	Platform        string  `bun:"platform"`
}

// GuildRepo provides aggregate-shaped access to guild configuration and membership tables.
type GuildRepo struct {
	db *bun.DB
}

// NewGuildRepo returns a repository backed by the given bun handle.
func NewGuildRepo(db *bun.DB) *GuildRepo {
	return &GuildRepo{db: db}
}

// --- membership ---

// UpsertMembership idempotently upserts keyed by (game, guild_id, discord_user_id).
func (r *GuildRepo) UpsertMembership(
	ctx context.Context,
	game models.Game,
	guildID, discordUserID string,
	playerID int32,
) (*models.GuildMembership, error) {
	now := NowMS()
	row := models.GuildMembership{
		Game:              game,
		GuildID:           guildID,
		DiscordUserID:     discordUserID,
		PlayerID:          playerID,
		InternalElo:       1000,
		RatingDeviation:   350,
		InternalMatches:   0,
		InternalWins:      0,
		InternalLosses:    0,
		InternalUpdatedAt: nil,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	var out models.GuildMembership
	_, err := r.db.NewInsert().
		Model(&row).
		On("CONFLICT (game, guild_id, discord_user_id) DO UPDATE").
		Set("player_id = EXCLUDED.player_id").
		Set("updated_at = EXCLUDED.updated_at").
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// TopMembershipsByElo returns the top-N memberships by internal_elo for a guild.
func (r *GuildRepo) TopMembershipsByElo(
	ctx context.Context,
	game models.Game,
	guildID string,
	limit int,
) ([]models.GuildMembership, error) {
	var rows []models.GuildMembership
	err := r.db.NewSelect().
		Model(&rows).
		Where("game = ?", game).
		Where("guild_id = ?", guildID).
		Order("internal_elo DESC").
		Limit(limit).
		Scan(ctx)
	return rows, err
}

// ListMembersForGuild returns the full guild roster joined with player identity fields.
func (r *GuildRepo) ListMembersForGuild(
	ctx context.Context,
	game models.Game,
	guildID string,
) ([]GuildMemberRow, error) {
	var rows []GuildMemberRow
	err := r.db.NewSelect().
		ColumnExpr("gm.discord_user_id").
		ColumnExpr("gm.player_id").
		ColumnExpr("gm.internal_elo").
		ColumnExpr("gm.rating_deviation").
		ColumnExpr("p.username").
		ColumnExpr("p.platform").
		TableExpr("guild_memberships AS gm").
		Join("INNER JOIN players AS p ON p.id = gm.player_id").
		Where("gm.game = ?", game).
		Where("gm.guild_id = ?", guildID).
		Scan(ctx, &rows)
	return rows, err
}

// FindMembersByDiscordIDs loads memberships for a subset of Discord users within a guild.
func (r *GuildRepo) FindMembersByDiscordIDs(
	ctx context.Context,
	game models.Game,
	guildID string,
	discordUserIDs []string,
) ([]GuildMemberRow, error) {
	if len(discordUserIDs) == 0 {
		return nil, nil
	}
	var rows []GuildMemberRow
	err := r.db.NewSelect().
		ColumnExpr("gm.discord_user_id").
		ColumnExpr("gm.player_id").
		ColumnExpr("gm.internal_elo").
		ColumnExpr("gm.rating_deviation").
		ColumnExpr("p.username").
		ColumnExpr("p.platform").
		TableExpr("guild_memberships AS gm").
		Join("INNER JOIN players AS p ON p.id = gm.player_id").
		Where("gm.game = ?", game).
		Where("gm.guild_id = ?", guildID).
		Where("gm.discord_user_id IN (?)", bun.List(discordUserIDs)).
		Scan(ctx, &rows)
	return rows, err
}

// UpdateMembershipRating applies a post-match Glicko-style rating update.
func (r *GuildRepo) UpdateMembershipRating(
	ctx context.Context,
	game models.Game,
	guildID, discordUserID string,
	newElo, newPhi float64,
	won bool,
) error {
	now := NowMS()
	var membership models.GuildMembership
	err := r.db.NewSelect().
		Model(&membership).
		Where("game = ?", game).
		Where("guild_id = ?", guildID).
		Where("discord_user_id = ?", discordUserID).
		Scan(ctx)
	if err != nil {
		return err
	}

	wins := membership.InternalWins
	losses := membership.InternalLosses
	if won {
		wins++
	} else {
		losses++
	}

	_, err = r.db.NewUpdate().
		Model((*models.GuildMembership)(nil)).
		Set("internal_elo = ?", newElo).
		Set("rating_deviation = ?", newPhi).
		Set("internal_matches = ?", membership.InternalMatches+1).
		Set("internal_wins = ?", wins).
		Set("internal_losses = ?", losses).
		Set("internal_updated_at = ?", now).
		Set("updated_at = ?", now).
		Where("game = ?", game).
		Where("guild_id = ?", guildID).
		Where("discord_user_id = ?", discordUserID).
		Exec(ctx)
	return err
}

// GuildIDsForPlayer returns guild IDs where a player is registered.
func (r *GuildRepo) GuildIDsForPlayer(
	ctx context.Context,
	game models.Game,
	playerID int32,
) ([]string, error) {
	var ids []string
	err := r.db.NewSelect().
		Model((*models.GuildMembership)(nil)).
		Column("guild_id").
		Where("game = ?", game).
		Where("player_id = ?", playerID).
		Scan(ctx, &ids)
	return ids, err
}

// --- settings ---

// GetSettings loads guild settings for (guild_id, game).
func (r *GuildRepo) GetSettings(
	ctx context.Context,
	guildID string,
	game models.Game,
) (*models.GuildSettings, error) {
	var row models.GuildSettings
	err := r.db.NewSelect().
		Model(&row).
		Where("guild_id = ?", guildID).
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

// UpsertSettings inserts or updates guild settings.
func (r *GuildRepo) UpsertSettings(ctx context.Context, row *models.GuildSettings) (*models.GuildSettings, error) {
	if row == nil {
		return nil, fmt.Errorf("guild settings row is nil")
	}
	var out models.GuildSettings
	_, err := r.db.NewInsert().
		Model(row).
		On("CONFLICT (guild_id, game) DO UPDATE").
		Set("default_team_format = EXCLUDED.default_team_format").
		Set("auto_balance = EXCLUDED.auto_balance").
		Set("cross_guild_matchmaking = EXCLUDED.cross_guild_matchmaking").
		Set("updated_at = EXCLUDED.updated_at").
		Set("updated_by_discord_user_id = EXCLUDED.updated_by_discord_user_id").
		Set("matchmaking_enabled = EXCLUDED.matchmaking_enabled").
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// --- matchmaking rules ---

// GetMatchmakingRules loads guild matchmaking rules for (guild_id, game).
func (r *GuildRepo) GetMatchmakingRules(
	ctx context.Context,
	guildID string,
	game models.Game,
) (*models.GuildMatchmakingRules, error) {
	var row models.GuildMatchmakingRules
	err := r.db.NewSelect().
		Model(&row).
		Where("guild_id = ?", guildID).
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

// UpsertMatchmakingRules inserts or updates guild matchmaking rules.
func (r *GuildRepo) UpsertMatchmakingRules(
	ctx context.Context,
	row *models.GuildMatchmakingRules,
) (*models.GuildMatchmakingRules, error) {
	if row == nil {
		return nil, fmt.Errorf("guild matchmaking rules row is nil")
	}
	var out models.GuildMatchmakingRules
	_, err := r.db.NewInsert().
		Model(row).
		On("CONFLICT (guild_id, game) DO UPDATE").
		Set("min_elo = EXCLUDED.min_elo").
		Set("max_elo = EXCLUDED.max_elo").
		Set("platforms = EXCLUDED.platforms").
		Set("require_verified = EXCLUDED.require_verified").
		Set("max_elo_gap = EXCLUDED.max_elo_gap").
		Set("updated_at = EXCLUDED.updated_at").
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// --- quotas ---

// GetMatchQuota loads the guild daily match quota for (guild_id, game).
func (r *GuildRepo) GetMatchQuota(
	ctx context.Context,
	guildID string,
	game models.Game,
) (*models.GuildMatchQuota, error) {
	var row models.GuildMatchQuota
	err := r.db.NewSelect().
		Model(&row).
		Where("guild_id = ?", guildID).
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

// UpsertMatchQuota inserts or updates guild match quotas.
func (r *GuildRepo) UpsertMatchQuota(
	ctx context.Context,
	row *models.GuildMatchQuota,
) (*models.GuildMatchQuota, error) {
	if row == nil {
		return nil, fmt.Errorf("guild match quota row is nil")
	}
	var out models.GuildMatchQuota
	_, err := r.db.NewInsert().
		Model(row).
		On("CONFLICT (game, guild_id) DO UPDATE").
		Set("daily_match_limit = EXCLUDED.daily_match_limit").
		Set("updated_by_discord_user_id = EXCLUDED.updated_by_discord_user_id").
		Set("updated_at = EXCLUDED.updated_at").
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// --- account deletion cooldown ---

// DiscordUserIDHash returns the HMAC-SHA256 hex digest used for cooldown rows.
func DiscordUserIDHash(discordUserID, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(discordUserID))
	return hex.EncodeToString(mac.Sum(nil))
}

// IsDeletionBlocked returns cooldown_until epoch ms when the user is still blocked.
func (r *GuildRepo) IsDeletionBlocked(
	ctx context.Context,
	discordUserID, secret string,
) (*int64, error) {
	hash := DiscordUserIDHash(discordUserID, secret)
	now := NowMS()
	var until int64
	err := r.db.NewSelect().
		Model((*models.AccountDeletionCooldown)(nil)).
		Column("cooldown_until").
		Where("discord_user_id_hash = ?", hash).
		Scan(ctx, &until)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if until > now {
		return &until, nil
	}
	return nil, nil
}

// RecordRelinkCooldown records or refreshes a re-link ban for the given duration.
func (r *GuildRepo) RecordRelinkCooldown(
	ctx context.Context,
	discordUserID, secret string,
	sinceMs, durationMS int64,
) (int64, error) {
	hash := DiscordUserIDHash(discordUserID, secret)
	until := sinceMs + durationMS
	row := models.AccountDeletionCooldown{
		DiscordUserIDHash: hash,
		DeletedAt:         sinceMs,
		CooldownUntil:     until,
	}
	_, err := r.db.NewInsert().
		Model(&row).
		On("CONFLICT (discord_user_id_hash) DO UPDATE").
		Set("deleted_at = EXCLUDED.deleted_at").
		Set("cooldown_until = EXCLUDED.cooldown_until").
		Exec(ctx)
	if err != nil {
		return 0, err
	}
	return until, nil
}

// RecordDeletionCooldown records or refreshes the post-deletion cooldown window.
func (r *GuildRepo) RecordDeletionCooldown(
	ctx context.Context,
	discordUserID, secret string,
	deletedAt int64,
) error {
	_, err := r.RecordRelinkCooldown(ctx, discordUserID, secret, deletedAt, DeletionCooldownMS)
	return err
}
