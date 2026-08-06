package services

import (
	"context"
	"fmt"

	userv1 "github.com/bake-computers/parley/gen/parley/user/v1"
	"github.com/bake-computers/parley/internal/apperr"
	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
)

type UserSettingsService struct {
	users  *repos.UserSettingsRepo
	guilds *repos.GuildRepo
	ident  *repos.IdentityRepo
}

func NewUserSettingsService(
	users *repos.UserSettingsRepo,
	guilds *repos.GuildRepo,
	ident *repos.IdentityRepo,
) *UserSettingsService {
	return &UserSettingsService{users: users, guilds: guilds, ident: ident}
}

func (s *UserSettingsService) GetUserSettings(
	ctx context.Context,
	discordUserID string,
) (*userv1.UserSettings, error) {
	row, err := s.users.Get(ctx, discordUserID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return defaultSettings(discordUserID), nil
	}
	return rowToProto(row), nil
}

func (s *UserSettingsService) UpsertUserSettings(
	ctx context.Context,
	settings *userv1.UserSettings,
) (*userv1.UserSettings, error) {
	now := repos.NowMS()

	newRow := &models.NewUserSettings{
		DiscordUserID:      settings.GetDiscordUserId(),
		CreatedAt:          now,
		UpdatedAt:          now,
		MatchmakingEnabled: settings.GetMatchmakingEnabled(),
		ProfilePublic:      settings.GetProfilePublic(),
	}

	saved, err := s.users.Upsert(ctx, newRow)
	if err != nil {
		return nil, err
	}
	return rowToProto(saved), nil
}

func (s *UserSettingsService) DeleteUserData(
	ctx context.Context,
	discordUserID, actingUserID, hmacSecret string,
) (*userv1.DeleteUserDataResponse, error) {
	if hmacSecret == "" {
		return nil, apperr.FailedPrecondition("ACCOUNT_DELETION_HMAC_SECRET not configured")
	}
	// The HMAC secret only keys the cooldown hash; it never proved the
	// caller owned the target id. Only the verified caller (asserted by
	// the authenticated edge) may anonymize their own account.
	if actingUserID == "" || actingUserID != discordUserID {
		return nil, apperr.PermissionDenied("can only delete your own account")
	}

	blocked, err := s.guilds.IsDeletionBlocked(ctx, discordUserID, hmacSecret)
	if err != nil {
		return nil, err
	}
	if blocked != nil {
		return nil, apperr.FailedPrecondition(fmt.Sprintf("account deletion blocked until %d", *blocked))
	}

	report, err := s.ident.AnonymizePlayer(ctx, discordUserID, hmacSecret)
	if err != nil {
		return nil, err
	}
	if report.AnonymizedDiscordUserID == "" {
		return nil, apperr.NotFound("no linked account found for this discord user")
	}

	_ = s.users.Delete(ctx, discordUserID)

	deletedAt := repos.NowMS()
	_ = s.guilds.RecordDeletionCooldown(ctx, discordUserID, hmacSecret, deletedAt)
	cooldownUntil := deletedAt + repos.DeletionCooldownMS

	return &userv1.DeleteUserDataResponse{
		Success:                 true,
		AnonymizedDiscordUserId: report.AnonymizedDiscordUserID,
		CooldownUntilMs:         cooldownUntil,
		TablesAffected:          reportToProto(report),
	}, nil
}

func defaultSettings(discordUserID string) *userv1.UserSettings {
	return &userv1.UserSettings{
		DiscordUserId:      discordUserID,
		UpdatedAtMs:        0,
		MatchmakingEnabled: true,
		ProfilePublic:      true,
	}
}

func rowToProto(row *models.UserSettings) *userv1.UserSettings {
	return &userv1.UserSettings{
		DiscordUserId:      row.DiscordUserID,
		UpdatedAtMs:        row.UpdatedAt,
		MatchmakingEnabled: row.MatchmakingEnabled,
		ProfilePublic:      row.ProfilePublic,
	}
}

func reportToProto(report *repos.AnonymizationReport) *userv1.AnonymizationCounts {
	return &userv1.AnonymizationCounts{
		Players:               int32(report.Players),
		DiscordIdentities:     int32(report.DiscordIdentities),
		GuildMemberships:      int32(report.GuildMemberships),
		Matches:               int32(report.Matches),
		MatchParticipants:     int32(report.MatchParticipants),
		Tournaments:           int32(report.Tournaments),
		TournamentTeams:       int32(report.TournamentTeams),
		TournamentTeamRosters: int32(report.TournamentTeamRosters),
		GuildSettingsAudit:    int32(report.GuildSettingsAudit),
		GuildMatchQuotasAudit: int32(report.GuildMatchQuotasAudit),
	}
}
