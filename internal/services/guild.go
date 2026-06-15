package services

import (
	"context"
	"fmt"

	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	guildv1 "github.com/parley-bot/parley/gen/parley/guild/v1"
	"github.com/parley-bot/parley/internal/apperr"
	"github.com/parley-bot/parley/internal/models"
	"github.com/parley-bot/parley/internal/repos"
)

type GuildService struct {
	repo *repos.GuildRepo
}

func NewGuildService(repo *repos.GuildRepo) *GuildService {
	return &GuildService{repo: repo}
}

func (s *GuildService) GetGuildSettings(
	ctx context.Context,
	guildID string,
	game commonv1.Game,
) (*guildv1.GuildSettings, error) {
	g, err := protoGameToModel(game)
	if err != nil {
		return nil, apperr.InvalidArgument("game must be specified")
	}

	row, err := s.repo.GetSettings(ctx, guildID, g)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get settings: %v", err))
	}

	if row == nil {
		return &guildv1.GuildSettings{
			GuildId:               guildID,
			Game:                  game,
			AutoBalance:           true,
			CrossGuildMatchmaking: true,
			DefaultLanguage:       commonv1.Language_LANGUAGE_EN,
			MatchmakingEnabled:    true,
		}, nil
	}

	return settingsToProto(row), nil
}

func (s *GuildService) UpsertGuildSettings(
	ctx context.Context,
	settings *guildv1.GuildSettings,
) (*guildv1.GuildSettings, error) {
	if settings == nil {
		return nil, apperr.InvalidArgument("settings is required")
	}
	g, err := protoGameToModel(settings.Game)
	if err != nil {
		return nil, apperr.InvalidArgument("game must be specified")
	}

	now := NowMS()
	var teamFmt *string
	if settings.DefaultTeamFormat != "" {
		tf := settings.DefaultTeamFormat
		teamFmt = &tf
	}

	row := &models.GuildSettings{
		GuildID:                settings.GuildId,
		Game:                   g,
		DefaultTeamFormat:      teamFmt,
		AutoBalance:            settings.AutoBalance,
		CrossGuildMatchmaking:  settings.CrossGuildMatchmaking,
		UpdatedAt:              now,
		UpdatedByDiscordUserID: settings.UpdatedByDiscordUserId,
		DefaultLanguage:        protoLangToDB(settings.DefaultLanguage),
		MatchmakingEnabled:     settings.MatchmakingEnabled,
	}

	saved, err := s.repo.UpsertSettings(ctx, row)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("upsert settings: %v", err))
	}

	return settingsToProto(saved), nil
}

func (s *GuildService) GetMatchmakingRules(
	ctx context.Context,
	guildID string,
	game commonv1.Game,
) (*guildv1.GuildMatchmakingRules, error) {
	g, err := protoGameToModel(game)
	if err != nil {
		return nil, apperr.InvalidArgument("game must be specified")
	}

	row, err := s.repo.GetMatchmakingRules(ctx, guildID, g)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get matchmaking rules: %v", err))
	}

	if row == nil {
		return &guildv1.GuildMatchmakingRules{
			GuildId:   guildID,
			Game:      game,
			MaxEloGap: 500,
		}, nil
	}

	return rulesToProto(row), nil
}

func (s *GuildService) UpsertMatchmakingRules(
	ctx context.Context,
	rules *guildv1.GuildMatchmakingRules,
) (*guildv1.GuildMatchmakingRules, error) {
	if rules == nil {
		return nil, apperr.InvalidArgument("rules is required")
	}
	g, err := protoGameToModel(rules.Game)
	if err != nil {
		return nil, apperr.InvalidArgument("game must be specified")
	}

	now := NowMS()
	var minElo, maxElo *int32
	if rules.MinElo != 0 {
		v := rules.MinElo
		minElo = &v
	}
	if rules.MaxElo != 0 {
		v := rules.MaxElo
		maxElo = &v
	}
	var platforms []string
	if len(rules.Platforms) > 0 {
		platforms = rules.Platforms
	}
	maxGap := rules.MaxEloGap
	if maxGap == 0 {
		maxGap = 500
	}

	row := &models.GuildMatchmakingRules{
		GuildID:         rules.GuildId,
		Game:            g,
		MinElo:          minElo,
		MaxElo:          maxElo,
		Platforms:       platforms,
		RequireVerified: rules.RequireVerified,
		MaxEloGap:       maxGap,
		UpdatedAt:       now,
	}

	saved, err := s.repo.UpsertMatchmakingRules(ctx, row)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("upsert matchmaking rules: %v", err))
	}

	return rulesToProto(saved), nil
}

func (s *GuildService) GetNotificationSettings(
	ctx context.Context,
	guildID string,
	game commonv1.Game,
) (*guildv1.GuildNotificationSettings, error) {
	g, err := protoGameToModel(game)
	if err != nil {
		return nil, apperr.InvalidArgument("game must be specified")
	}

	row, err := s.repo.GetNotificationSettings(ctx, guildID, g)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get notification settings: %v", err))
	}

	if row == nil {
		return &guildv1.GuildNotificationSettings{
			GuildId: guildID,
			Game:    game,
		}, nil
	}

	return notifToProto(row), nil
}

func (s *GuildService) UpsertNotificationSettings(
	ctx context.Context,
	settings *guildv1.GuildNotificationSettings,
) (*guildv1.GuildNotificationSettings, error) {
	if settings == nil {
		return nil, apperr.InvalidArgument("settings is required")
	}
	g, err := protoGameToModel(settings.Game)
	if err != nil {
		return nil, apperr.InvalidArgument("game must be specified")
	}

	now := NowMS()
	var matchCh, tourCh *string
	if settings.MatchResultsChannel != "" {
		v := settings.MatchResultsChannel
		matchCh = &v
	}
	if settings.TournamentAnnouncementsChannel != "" {
		v := settings.TournamentAnnouncementsChannel
		tourCh = &v
	}

	row := &models.GuildNotificationSettings{
		GuildID:                        settings.GuildId,
		Game:                           g,
		MatchResultsChannel:            matchCh,
		TournamentAnnouncementsChannel: tourCh,
		LeaderboardUpdatesEnabled:      settings.LeaderboardUpdatesEnabled,
		UpdatedAt:                      now,
	}

	saved, err := s.repo.UpsertNotificationSettings(ctx, row)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("upsert notification settings: %v", err))
	}

	return notifToProto(saved), nil
}

func (s *GuildService) GetMatchQuota(
	ctx context.Context,
	guildID string,
	game commonv1.Game,
) (*guildv1.GuildMatchQuota, error) {
	g, err := protoGameToModel(game)
	if err != nil {
		return nil, apperr.InvalidArgument("game must be specified")
	}

	row, err := s.repo.GetMatchQuota(ctx, guildID, g)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get match quota: %v", err))
	}

	if row == nil {
		return &guildv1.GuildMatchQuota{
			GuildId: guildID,
			Game:    game,
		}, nil
	}

	return quotaToProto(row), nil
}

func (s *GuildService) UpsertMatchQuota(
	ctx context.Context,
	quota *guildv1.GuildMatchQuota,
) (*guildv1.GuildMatchQuota, error) {
	if quota == nil {
		return nil, apperr.InvalidArgument("quota is required")
	}
	g, err := protoGameToModel(quota.Game)
	if err != nil {
		return nil, apperr.InvalidArgument("game must be specified")
	}

	now := NowMS()
	row := &models.GuildMatchQuota{
		Game:                   g,
		GuildID:                quota.GuildId,
		DailyMatchLimit:        quota.DailyMatchLimit,
		UpdatedByDiscordUserID: quota.UpdatedByDiscordUserId,
		CreatedAt:              now,
		UpdatedAt:              now,
	}

	saved, err := s.repo.UpsertMatchQuota(ctx, row)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("upsert match quota: %v", err))
	}

	return quotaToProto(saved), nil
}

func settingsToProto(row *models.GuildSettings) *guildv1.GuildSettings {
	teamFmt := ""
	if row.DefaultTeamFormat != nil {
		teamFmt = *row.DefaultTeamFormat
	}
	return &guildv1.GuildSettings{
		GuildId:                row.GuildID,
		Game:                   dbGameToProto(row.Game),
		DefaultTeamFormat:      teamFmt,
		AutoBalance:            row.AutoBalance,
		CrossGuildMatchmaking:  row.CrossGuildMatchmaking,
		UpdatedAtMs:            row.UpdatedAt,
		UpdatedByDiscordUserId: row.UpdatedByDiscordUserID,
		DefaultLanguage:        dbLangToProto(row.DefaultLanguage),
		MatchmakingEnabled:     row.MatchmakingEnabled,
	}
}

func rulesToProto(row *models.GuildMatchmakingRules) *guildv1.GuildMatchmakingRules {
	var minElo, maxElo int32
	if row.MinElo != nil {
		minElo = *row.MinElo
	}
	if row.MaxElo != nil {
		maxElo = *row.MaxElo
	}
	platforms := row.Platforms
	if platforms == nil {
		platforms = []string{}
	}
	return &guildv1.GuildMatchmakingRules{
		GuildId:         row.GuildID,
		Game:            dbGameToProto(row.Game),
		MinElo:          minElo,
		MaxElo:          maxElo,
		Platforms:       platforms,
		RequireVerified: row.RequireVerified,
		MaxEloGap:       row.MaxEloGap,
		UpdatedAtMs:     row.UpdatedAt,
	}
}

func notifToProto(row *models.GuildNotificationSettings) *guildv1.GuildNotificationSettings {
	matchCh := ""
	if row.MatchResultsChannel != nil {
		matchCh = *row.MatchResultsChannel
	}
	tourCh := ""
	if row.TournamentAnnouncementsChannel != nil {
		tourCh = *row.TournamentAnnouncementsChannel
	}
	return &guildv1.GuildNotificationSettings{
		GuildId:                        row.GuildID,
		Game:                           dbGameToProto(row.Game),
		MatchResultsChannel:            matchCh,
		TournamentAnnouncementsChannel: tourCh,
		LeaderboardUpdatesEnabled:      row.LeaderboardUpdatesEnabled,
		UpdatedAtMs:                    row.UpdatedAt,
	}
}

func quotaToProto(row *models.GuildMatchQuota) *guildv1.GuildMatchQuota {
	return &guildv1.GuildMatchQuota{
		GuildId:                row.GuildID,
		Game:                   dbGameToProto(row.Game),
		DailyMatchLimit:        row.DailyMatchLimit,
		UpdatedByDiscordUserId: row.UpdatedByDiscordUserID,
		UpdatedAtMs:            row.UpdatedAt,
	}
}
