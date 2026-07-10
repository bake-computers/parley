package services

import (
	"context"
	"testing"

	commonv1 "github.com/pactum-computers/parley/gen/parley/common/v1"
	userv1 "github.com/pactum-computers/parley/gen/parley/user/v1"
	"github.com/pactum-computers/parley/internal/models"
	"github.com/pactum-computers/parley/internal/repos"
)

func TestDefaultSettings(t *testing.T) {
	s := defaultSettings("u1")
	if s.DiscordUserId != "u1" {
		t.Errorf("DiscordUserId = %q, want %q", s.DiscordUserId, "u1")
	}
	if s.UpdatedAtMs != 0 {
		t.Errorf("UpdatedAtMs = %d, want 0", s.UpdatedAtMs)
	}
	if !s.MatchmakingEnabled {
		t.Error("MatchmakingEnabled should be true")
	}
	if s.TermsAcceptedAtMs != 0 {
		t.Errorf("TermsAcceptedAtMs = %d, want 0", s.TermsAcceptedAtMs)
	}
	if !s.ProfilePublic {
		t.Error("ProfilePublic should be true")
	}
	if s.MatchmakingRegion != commonv1.Region_REGION_UNSPECIFIED {
		t.Errorf("MatchmakingRegion = %v, want global", s.MatchmakingRegion)
	}
}

func TestRowToProtoCarriesNewFields(t *testing.T) {
	row := &models.UserSettings{
		DiscordUserID:      "u1",
		CreatedAt:          1000,
		UpdatedAt:          2000,
		MatchmakingEnabled: false,
		TermsAcceptedAtMs:  0,
		ProfilePublic:      false,
		MatchmakingRegion:  int32(commonv1.Region_REGION_EU),
	}
	p := rowToProto(row)
	if p.TermsAcceptedAtMs != 0 {
		t.Errorf("TermsAcceptedAtMs = %d, want 0", p.TermsAcceptedAtMs)
	}
	if p.ProfilePublic {
		t.Error("ProfilePublic should be false")
	}
	if p.DiscordUserId != "u1" {
		t.Errorf("DiscordUserId = %q, want %q", p.DiscordUserId, "u1")
	}
	if p.UpdatedAtMs != 2000 {
		t.Errorf("UpdatedAtMs = %d, want 2000", p.UpdatedAtMs)
	}
	if p.MatchmakingEnabled {
		t.Error("MatchmakingEnabled should be false")
	}
	if p.MatchmakingRegion != commonv1.Region_REGION_EU {
		t.Errorf("MatchmakingRegion = %v, want EU", p.MatchmakingRegion)
	}
}

func TestIsValidMatchmakingRegion(t *testing.T) {
	for _, region := range []commonv1.Region{
		commonv1.Region_REGION_UNSPECIFIED,
		commonv1.Region_REGION_EU,
		commonv1.Region_REGION_NA,
		commonv1.Region_REGION_APAC,
		commonv1.Region_REGION_SA,
	} {
		if !isValidMatchmakingRegion(region) {
			t.Errorf("region %v should be valid", region)
		}
	}
	if isValidMatchmakingRegion(commonv1.Region(99)) {
		t.Error("unknown region should be invalid")
	}
}

func TestUpsertUserSettingsRejectsUnknownMatchmakingRegion(t *testing.T) {
	svc := &UserSettingsService{}
	_, err := svc.UpsertUserSettings(context.Background(), &userv1.UserSettings{
		DiscordUserId:     "u1",
		MatchmakingRegion: commonv1.Region(99),
	})
	if err == nil {
		t.Fatal("expected invalid matchmaking region error")
	}
}

func TestReportToProto(t *testing.T) {
	report := &repos.AnonymizationReport{
		AnonymizedDiscordUserID:      "deleted_abc",
		Players:                      1,
		DiscordIdentities:            2,
		GuildMemberships:             3,
		Matches:                      4,
		MatchParticipants:            5,
		MatchmakingQueues:            6,
		MatchmakingQueueParticipants: 7,
		Tournaments:                  8,
		TournamentTeams:              9,
		TournamentTeamRosters:        10,
		GuildSettingsAudit:           11,
		GuildMatchQuotasAudit:        12,
	}
	p := reportToProto(report)
	if p.Players != 1 {
		t.Errorf("Players = %d, want 1", p.Players)
	}
	if p.DiscordIdentities != 2 {
		t.Errorf("DiscordIdentities = %d, want 2", p.DiscordIdentities)
	}
	if p.GuildMemberships != 3 {
		t.Errorf("GuildMemberships = %d, want 3", p.GuildMemberships)
	}
	if p.Matches != 4 {
		t.Errorf("Matches = %d, want 4", p.Matches)
	}
	if p.MatchParticipants != 5 {
		t.Errorf("MatchParticipants = %d, want 5", p.MatchParticipants)
	}
	if p.MatchmakingQueues != 6 {
		t.Errorf("MatchmakingQueues = %d, want 6", p.MatchmakingQueues)
	}
	if p.MatchmakingQueueParticipants != 7 {
		t.Errorf("MatchmakingQueueParticipants = %d, want 7", p.MatchmakingQueueParticipants)
	}
	if p.Tournaments != 8 {
		t.Errorf("Tournaments = %d, want 8", p.Tournaments)
	}
	if p.TournamentTeams != 9 {
		t.Errorf("TournamentTeams = %d, want 9", p.TournamentTeams)
	}
	if p.TournamentTeamRosters != 10 {
		t.Errorf("TournamentTeamRosters = %d, want 10", p.TournamentTeamRosters)
	}
	if p.GuildSettingsAudit != 11 {
		t.Errorf("GuildSettingsAudit = %d, want 11", p.GuildSettingsAudit)
	}
	if p.GuildMatchQuotasAudit != 12 {
		t.Errorf("GuildMatchQuotasAudit = %d, want 12", p.GuildMatchQuotasAudit)
	}
}

func TestProtoGameToModel(t *testing.T) {
	tests := []struct {
		proto   commonv1.Game
		model   models.Game
		wantErr bool
	}{
		{commonv1.Game_GAME_R6, models.GameR6, false},
		{commonv1.Game_GAME_UNSPECIFIED, "", true},
	}
	for _, tt := range tests {
		got, err := protoGameToModel(tt.proto)
		if (err != nil) != tt.wantErr {
			t.Errorf("protoGameToModel(%v) error = %v, wantErr %v", tt.proto, err, tt.wantErr)
			continue
		}
		if got != tt.model {
			t.Errorf("protoGameToModel(%v) = %q, want %q", tt.proto, got, tt.model)
		}
	}
}
