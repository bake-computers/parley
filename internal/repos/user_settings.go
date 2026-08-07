package repos

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/bake-computers/parley/internal/models"
	"github.com/uptrace/bun"
)

// UserSettingsRepo provides access to user_settings.
type UserSettingsRepo struct {
	db *bun.DB
}

// NewUserSettingsRepo returns a user settings repository.
func NewUserSettingsRepo(db *bun.DB) *UserSettingsRepo {
	return &UserSettingsRepo{db: db}
}

// Get loads user settings by discord_user_id. Returns (nil, nil) when
// the user has no settings row, matching the Rust UserSettingsRepo::get
// contract used by the matchmaking engine.
func (r *UserSettingsRepo) Get(
	ctx context.Context,
	discordUserID string,
) (*models.UserSettings, error) {
	var row models.UserSettings
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

func (r *UserSettingsRepo) Upsert(
	ctx context.Context,
	row *models.NewUserSettings,
) (*models.UserSettings, error) {
	if row == nil {
		return nil, fmt.Errorf("user settings row is nil")
	}
	var out models.UserSettings
	_, err := r.db.NewInsert().
		Model(row).
		On("CONFLICT (discord_user_id) DO UPDATE").
		Set("updated_at = EXCLUDED.updated_at").
		Set("matchmaking_enabled = EXCLUDED.matchmaking_enabled").
		Set("profile_public = EXCLUDED.profile_public").
		Returning("*").
		Exec(ctx, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *UserSettingsRepo) Delete(
	ctx context.Context,
	discordUserID string,
) error {
	_, err := r.db.NewDelete().
		Model((*models.UserSettings)(nil)).
		Where("discord_user_id = ?", discordUserID).
		Exec(ctx)
	return err
}

// GetMany loads settings rows for the given Discord user ids.
// Missing rows are omitted from the map (callers apply defaults).
func (r *UserSettingsRepo) GetMany(
	ctx context.Context,
	discordUserIDs []string,
) (map[string]models.UserSettings, error) {
	out := make(map[string]models.UserSettings, len(discordUserIDs))
	if len(discordUserIDs) == 0 {
		return out, nil
	}
	var rows []models.UserSettings
	err := r.db.NewSelect().
		Model(&rows).
		Where("discord_user_id IN (?)", bun.In(discordUserIDs)).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.DiscordUserID] = row
	}
	return out, nil
}
