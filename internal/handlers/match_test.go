package handlers_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/pactum-computers/parley/gen/parley/common/v1"
	matchv1 "github.com/pactum-computers/parley/gen/parley/matchmaking/v1"
	"github.com/pactum-computers/parley/internal/handlers"
	"github.com/pactum-computers/parley/internal/services"
)

func newTestMatchHandler(t *testing.T) *handlers.MatchHandler {
	t.Helper()
	svc := services.NewMatchService(nil, nil, nil)
	return handlers.NewMatchHandler(svc)
}

// --- BuildTeams ---

func TestMatchHandlerBuildTeams_UnspecifiedGame(t *testing.T) {
	h := newTestMatchHandler(t)
	_, err := h.BuildTeams(context.Background(), connect.NewRequest(&matchv1.BuildTeamsRequest{
		GuildId:        "guild-1",
		Game:           commonv1.Game_GAME_UNSPECIFIED,
		DiscordUserIds: []string{"u1", "u2"},
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchHandlerBuildTeams_EmptyGuildID(t *testing.T) {
	h := newTestMatchHandler(t)
	_, err := h.BuildTeams(context.Background(), connect.NewRequest(&matchv1.BuildTeamsRequest{
		GuildId:        "",
		Game:           commonv1.Game_GAME_R6,
		DiscordUserIds: []string{"u1", "u2"},
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- ListGuildMembers ---

func TestMatchHandlerListGuildMembers_UnspecifiedGame(t *testing.T) {
	h := newTestMatchHandler(t)
	_, err := h.ListGuildMembers(context.Background(), connect.NewRequest(&matchv1.ListGuildMembersRequest{
		GuildId: "guild-1",
		Game:    commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchHandlerCreateCustomMatch_EmptyChannelID(t *testing.T) {
	h := newTestMatchHandler(t)
	_, err := h.CreateCustomMatch(context.Background(), connect.NewRequest(&matchv1.CreateCustomMatchRequest{
		GuildId:                "guild-1",
		ChannelId:              "",
		CreatedByDiscordUserId: "u1",
		Game:                   commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- ReportMatchResult ---

func TestMatchHandlerReportMatchResult_InvalidWinningTeam(t *testing.T) {
	h := newTestMatchHandler(t)
	_, err := h.ReportMatchResult(context.Background(), connect.NewRequest(&matchv1.ReportMatchResultRequest{
		MatchId:     1,
		Game:        commonv1.Game_GAME_R6,
		WinningTeam: "c",
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- GetMatch ---

func TestMatchHandlerGetMatch_UnspecifiedGame(t *testing.T) {
	h := newTestMatchHandler(t)
	_, err := h.GetMatch(context.Background(), connect.NewRequest(&matchv1.GetMatchRequest{
		MatchId: 1,
		Game:    commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- ListMatches ---

func TestMatchHandlerListMatches_InvalidCursor(t *testing.T) {
	h := newTestMatchHandler(t)
	_, err := h.ListMatches(context.Background(), connect.NewRequest(&matchv1.ListMatchesRequest{
		GuildId: "guild-1",
		Game:    commonv1.Game_GAME_R6,
		Cursor:  "not-base64!!!",
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- GetMatchByUuid ---

func TestMatchHandlerGetMatchByUuid_InvalidUUID(t *testing.T) {
	h := newTestMatchHandler(t)
	_, err := h.GetMatchByUuid(context.Background(), connect.NewRequest(&matchv1.GetMatchByUuidRequest{
		PublicUuid: "not-a-uuid",
		Game:       commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}
