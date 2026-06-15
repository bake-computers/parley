package services

import (
	"testing"

	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	"github.com/parley-bot/parley/internal/models"
	"github.com/parley-bot/parley/internal/repos"
)

func TestLanguageMappingRoundTrip(t *testing.T) {
	tests := []struct {
		proto commonv1.Language
		model models.Language
	}{
		{commonv1.Language_LANGUAGE_EN, models.LanguageEn},
		{commonv1.Language_LANGUAGE_DE, models.LanguageDe},
	}
	for _, tt := range tests {
		got := protoLangToModel(tt.proto)
		if got != tt.model {
			t.Errorf("protoLangToModel(%v) = %q, want %q", tt.proto, got, tt.model)
		}
		roundTrip := modelLangToProto(got)
		if roundTrip != tt.proto {
			t.Errorf("modelLangToProto(%q) = %v, want %v", got, roundTrip, tt.proto)
		}
	}
}

func TestProtoLangToModelUnspecified(t *testing.T) {
	got := protoLangToModel(commonv1.Language_LANGUAGE_UNSPECIFIED)
	if got != models.LanguageEn {
		t.Errorf("protoLangToModel(UNSPECIFIED) = %q, want %q", got, models.LanguageEn)
	}
}

func TestDefaultSettings(t *testing.T) {
	s := defaultSettings("u1")
	if s.DiscordUserId != "u1" {
		t.Errorf("DiscordUserId = %q, want %q", s.DiscordUserId, "u1")
	}
	if s.Language != commonv1.Language_LANGUAGE_EN {
		t.Errorf("Language = %v, want EN", s.Language)
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
	if s.Timezone != "UTC" {
		t.Errorf("Timezone = %q, want %q", s.Timezone, "UTC")
	}
}

func TestRowToProtoCarriesNewFields(t *testing.T) {
	row := &models.UserSettings{
		DiscordUserID:      "u1",
		Language:           models.LanguageDe,
		CreatedAt:          1000,
		UpdatedAt:          2000,
		MatchmakingEnabled: false,
		TermsAcceptedAtMs:  0,
		ProfilePublic:      false,
		Timezone:           "Europe/Berlin",
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
	if p.Language != commonv1.Language_LANGUAGE_DE {
		t.Errorf("Language = %v, want DE", p.Language)
	}
	if p.UpdatedAtMs != 2000 {
		t.Errorf("UpdatedAtMs = %d, want 2000", p.UpdatedAtMs)
	}
	if p.MatchmakingEnabled {
		t.Error("MatchmakingEnabled should be false")
	}
	if p.Timezone != "Europe/Berlin" {
		t.Errorf("Timezone = %q, want %q", p.Timezone, "Europe/Berlin")
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
		{commonv1.Game_GAME_BRAWL_STARS, models.GameBrawlStars, false},
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
