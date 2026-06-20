package repos

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/pactum-computers/parley/internal/models"
	"github.com/uptrace/bun"
)

// AnonymizationReport counts rows touched during GDPR-style anonymization.
type AnonymizationReport struct {
	AnonymizedDiscordUserID      string
	Players                      int
	DiscordIdentities            int
	GuildMemberships             int
	Matches                      int
	MatchParticipants            int
	MatchmakingQueues            int
	MatchmakingQueueParticipants int
	Tournaments                  int
	TournamentTeams              int
	TournamentTeamRosters        int
	GuildSettingsAudit           int
	GuildMatchQuotasAudit        int
}

// IdentityRepo provides access to players and discord_identities.
type IdentityRepo struct {
	db *bun.DB
}

// NewIdentityRepo returns a repository backed by the given bun handle.
func NewIdentityRepo(db *bun.DB) *IdentityRepo {
	return &IdentityRepo{db: db}
}

// UpsertPlayerByIdentity idempotently upserts keyed by (game, username_normalized, platform).
func (r *IdentityRepo) UpsertPlayerByIdentity(
	ctx context.Context,
	game models.Game,
	username, platform string,
	profileID, profileURL *string,
) (*models.Player, error) {
	normalized := NormalizeUsername(username)
	now := NowMS()

	row := models.NewPlayer{
		Game:               game,
		ProfileID:          profileID,
		Username:           username,
		UsernameNormalized: normalized,
		Platform:           platform,
		ProfileURL:         profileURL,
		Level:              0,
		InternalElo:        1000,
		InternalMatches:    0,
		InternalWins:       0,
		InternalLosses:     0,
		InternalUpdatedAt:  nil,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	var out models.Player
	_, err := r.db.NewInsert().
		Model(&row).
		On("CONFLICT (game, username_normalized, platform) DO UPDATE").
		Set("username = EXCLUDED.username").
		Set("profile_url = EXCLUDED.profile_url").
		Set("profile_id = EXCLUDED.profile_id").
		Set("updated_at = EXCLUDED.updated_at").
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// FindPlayer loads a player by primary key.
func (r *IdentityRepo) FindPlayer(ctx context.Context, id int32) (*models.Player, error) {
	var row models.Player
	err := r.db.NewSelect().
		Model(&row).
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// FindPlayerByIdentity loads a player by (game, username, platform).
func (r *IdentityRepo) FindPlayerByIdentity(
	ctx context.Context,
	game models.Game,
	username, platform string,
) (*models.Player, error) {
	normalized := NormalizeUsername(username)
	var row models.Player
	err := r.db.NewSelect().
		Model(&row).
		Where("game = ?", game).
		Where("username_normalized = ?", normalized).
		Where("platform = ?", platform).
		Scan(ctx)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// FindPlayerByUsernameNormalized returns the first linked player for a normalized username (any platform).
func (r *IdentityRepo) FindPlayerByUsernameNormalized(
	ctx context.Context,
	game models.Game,
	username string,
) (*models.Player, error) {
	normalized := NormalizeUsername(username)
	var row models.Player
	err := r.db.NewSelect().
		Model(&row).
		Where("game = ?", game).
		Where("username_normalized = ?", normalized).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// SeedEloIfUnrated sets internal_elo from rank_points when the player has no Parley matches.
func (r *IdentityRepo) SeedEloIfUnrated(ctx context.Context, playerID int32, rankPoints int32) error {
	if rankPoints <= 0 {
		return nil
	}
	elo := float64(rankPoints)
	now := NowMS()

	res, err := r.db.NewUpdate().
		Model((*models.Player)(nil)).
		Set("internal_elo = ?", elo).
		Set("updated_at = ?", now).
		Where("id = ?", playerID).
		Where("internal_matches = 0").
		Exec(ctx)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		return nil
	}

	_, err = r.db.NewUpdate().
		Model((*models.GuildMembership)(nil)).
		Set("internal_elo = ?", elo).
		Set("updated_at = ?", now).
		Where("player_id = ?", playerID).
		Where("internal_matches = 0").
		Exec(ctx)
	return err
}

// TouchPlayerInternalUpdatedAt sets internal_updated_at and updated_at on a player row.
func (r *IdentityRepo) TouchPlayerInternalUpdatedAt(ctx context.Context, id int32) error {
	now := NowMS()
	_, err := r.db.NewUpdate().
		Model((*models.Player)(nil)).
		Set("internal_updated_at = ?", now).
		Set("updated_at = ?", now).
		Where("id = ?", id).
		Exec(ctx)
	return err
}

// LinkDiscordIdentity idempotently links (game, discord_user_id) to player_id.
func (r *IdentityRepo) LinkDiscordIdentity(
	ctx context.Context,
	game models.Game,
	discordUserID string,
	playerID int32,
) (*models.DiscordIdentity, error) {
	now := NowMS()
	row := models.NewDiscordIdentity{
		Game:          game,
		DiscordUserID: discordUserID,
		PlayerID:      playerID,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	var out models.DiscordIdentity
	_, err := r.db.NewInsert().
		Model(&row).
		On("CONFLICT (game, player_id) DO UPDATE").
		Set("discord_user_id = EXCLUDED.discord_user_id").
		Set("updated_at = EXCLUDED.updated_at").
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// UnlinkDiscordIdentity removes links for (game, discord_user_id).
// When platform is non-empty, only the identity whose player uses that platform is removed.
func (r *IdentityRepo) UnlinkDiscordIdentity(
	ctx context.Context,
	game models.Game,
	discordUserID string,
	platform string,
) (int64, error) {
	q := r.db.NewDelete().
		Model((*models.DiscordIdentity)(nil)).
		Where("game = ?", game).
		Where("discord_user_id = ?", discordUserID)
	if platform != "" {
		q = q.Where(
			"player_id IN (SELECT id FROM players WHERE game = ? AND platform = ?)",
			game,
			platform,
		)
	}
	res, err := q.Exec(ctx)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// FindDiscordIdentities returns all identity rows for a Discord user, optionally filtered by game.
func (r *IdentityRepo) FindDiscordIdentities(
	ctx context.Context,
	game *models.Game,
	discordUserID string,
) ([]models.DiscordIdentity, error) {
	q := r.db.NewSelect().
		Model((*models.DiscordIdentity)(nil)).
		Where("discord_user_id = ?", discordUserID)
	if game != nil {
		q = q.Where("game = ?", *game)
	}
	var rows []models.DiscordIdentity
	err := q.Scan(ctx, &rows)
	return rows, err
}

// DiscordIdentityPage is a cursor-paginated result of discord_identities for one Discord user.
type DiscordIdentityPage struct {
	Rows       []models.DiscordIdentity
	NextCursor string
}

// ListDiscordIdentitiesByDiscord lists identity rows for a Discord user with keyset pagination
// on (created_at DESC, id DESC). game filters when non-nil.
func (r *IdentityRepo) ListDiscordIdentitiesByDiscord(
	ctx context.Context,
	discordUserID string,
	game *models.Game,
	cursor string,
	limit int,
) (*DiscordIdentityPage, error) {
	if limit <= 0 {
		limit = 50
	}
	createdAt, id, hasCursor, err := CursorTuple(cursor)
	if err != nil {
		return nil, err
	}

	q := r.db.NewSelect().
		Model((*models.DiscordIdentity)(nil)).
		Where("discord_user_id = ?", discordUserID)
	if game != nil {
		q = q.Where("game = ?", *game)
	}
	if hasCursor {
		q = q.Where("(created_at < ?) OR (created_at = ? AND id < ?)", createdAt, createdAt, id)
	}

	var rows []models.DiscordIdentity
	err = q.
		Order("created_at DESC").
		Order("id DESC").
		Limit(limit+1).
		Scan(ctx, &rows)
	if err != nil {
		return nil, err
	}

	page := &DiscordIdentityPage{}
	if len(rows) > limit {
		last := rows[limit-1]
		next, err := EncodeCursor(last.CreatedAt, last.ID)
		if err != nil {
			return nil, err
		}
		page.NextCursor = next
		rows = rows[:limit]
	}
	page.Rows = rows
	return page, nil
}

// AnonymizePlayer scrubs PII for all rows tied to discordUserID (GDPR deletion).
func (r *IdentityRepo) AnonymizePlayer(
	ctx context.Context,
	discordUserID, hmacSecret string,
) (*AnonymizationReport, error) {
	identities, err := r.FindDiscordIdentities(ctx, nil, discordUserID)
	if err != nil {
		return nil, err
	}
	if len(identities) == 0 {
		return &AnonymizationReport{}, nil
	}

	sentinel := fmt.Sprintf("deleted_%s", uuid.New().String())
	deletedAt := NowMS()
	report := &AnonymizationReport{AnonymizedDiscordUserID: sentinel}

	err = r.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		playerIDs := make([]int32, 0, len(identities))
		seen := make(map[int32]struct{}, len(identities))
		for _, id := range identities {
			if _, ok := seen[id.PlayerID]; ok {
				continue
			}
			seen[id.PlayerID] = struct{}{}
			playerIDs = append(playerIDs, id.PlayerID)
		}

		for _, playerID := range playerIDs {
			normalized := fmt.Sprintf("deleted_%d", playerID)
			res, err := tx.NewUpdate().
				Model((*models.Player)(nil)).
				Set("username = ?", "Deleted User").
				Set("username_normalized = ?", normalized).
				Set("profile_id = NULL").
				Set("profile_url = NULL").
				Set("updated_at = ?", deletedAt).
				Where("id = ?", playerID).
				Exec(ctx)
			if err != nil {
				return err
			}
			n, err := res.RowsAffected()
			if err != nil {
				return err
			}
			report.Players += int(n)
		}

		res, err := tx.NewUpdate().
			Model((*models.DiscordIdentity)(nil)).
			Set("discord_user_id = ?", sentinel).
			Set("updated_at = ?", deletedAt).
			Where("discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.DiscordIdentities = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.GuildMembership)(nil)).
			Set("discord_user_id = ?", sentinel).
			Set("updated_at = ?", deletedAt).
			Where("discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.GuildMemberships = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.MatchRow)(nil)).
			Set("created_by_discord_user_id = ?", sentinel).
			Set("updated_at = ?", deletedAt).
			Where("created_by_discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.Matches = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.MatchRow)(nil)).
			Set("opponent_captain_discord_user_id = ?", sentinel).
			Set("updated_at = ?", deletedAt).
			Where("opponent_captain_discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.Matches += int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.MatchParticipant)(nil)).
			Set("discord_user_id = ?", sentinel).
			Set("updated_at = ?", deletedAt).
			Where("discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.MatchParticipants = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.MatchmakingQueue)(nil)).
			Set("captain_discord_user_id = ?", sentinel).
			Set("updated_at = ?", deletedAt).
			Where("captain_discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.MatchmakingQueues = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.MatchmakingQueueParticipant)(nil)).
			Set("discord_user_id = ?", sentinel).
			Set("username = ?", "Deleted User").
			Set("updated_at = ?", deletedAt).
			Where("discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.MatchmakingQueueParticipants = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.Tournament)(nil)).
			Set("created_by_discord_user_id = ?", sentinel).
			Set("updated_at = ?", deletedAt).
			Where("created_by_discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.Tournaments = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.TournamentTeam)(nil)).
			Set("captain_discord_user_id = ?", sentinel).
			Set("updated_at = ?", deletedAt).
			Where("captain_discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.TournamentTeams = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.TournamentTeamRoster)(nil)).
			Set("discord_user_id = ?", sentinel).
			Set("username = ?", "Deleted User").
			Set("updated_at = ?", deletedAt).
			Where("discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.TournamentTeamRosters = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.GuildSettings)(nil)).
			Set("updated_by_discord_user_id = ?", sentinel).
			Where("updated_by_discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.GuildSettingsAudit = int(n)
		}

		res, err = tx.NewUpdate().
			Model((*models.GuildMatchQuota)(nil)).
			Set("updated_by_discord_user_id = ?", sentinel).
			Set("updated_at = ?", deletedAt).
			Where("updated_by_discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else {
			report.GuildMatchQuotasAudit = int(n)
		}

		_, err = tx.NewDelete().
			Model((*models.UserSettings)(nil)).
			Where("discord_user_id = ?", discordUserID).
			Exec(ctx)
		if err != nil {
			return err
		}

		hash := DiscordUserIDHash(discordUserID, hmacSecret)
		cooldown := models.AccountDeletionCooldown{
			DiscordUserIDHash: hash,
			DeletedAt:         deletedAt,
			CooldownUntil:     deletedAt + DeletionCooldownMS,
		}
		_, err = tx.NewInsert().
			Model(&cooldown).
			On("CONFLICT (discord_user_id_hash) DO UPDATE").
			Set("deleted_at = EXCLUDED.deleted_at").
			Set("cooldown_until = EXCLUDED.cooldown_until").
			Exec(ctx)
		return err
	})
	if err != nil {
		return nil, err
	}
	return report, nil
}
