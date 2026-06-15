package services_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	matchv1 "github.com/parley-bot/parley/gen/parley/matchmaking/v1"
	"github.com/parley-bot/parley/internal/services"
)

func newNilDBMatchService() *services.MatchService {
	return services.NewMatchService(nil, nil, nil, nil)
}

// --- BuildTeams ---

func TestMatchBuildTeams_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.BuildTeams(context.Background(), connect.NewRequest(&matchv1.BuildTeamsRequest{
		GuildId:        "guild-1",
		Game:           commonv1.Game_GAME_UNSPECIFIED,
		DiscordUserIds: []string{"u1", "u2"},
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchBuildTeams_EmptyGuildID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.BuildTeams(context.Background(), connect.NewRequest(&matchv1.BuildTeamsRequest{
		GuildId:        "  ",
		Game:           commonv1.Game_GAME_R6,
		DiscordUserIds: []string{"u1", "u2"},
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchBuildTeams_EmptyDiscordIDs(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.BuildTeams(context.Background(), connect.NewRequest(&matchv1.BuildTeamsRequest{
		GuildId:        "guild-1",
		Game:           commonv1.Game_GAME_R6,
		DiscordUserIds: nil,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- ListGuildMembers ---

func TestMatchListGuildMembers_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ListGuildMembers(context.Background(), connect.NewRequest(&matchv1.ListGuildMembersRequest{
		GuildId: "guild-1",
		Game:    commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchListGuildMembers_EmptyGuildID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ListGuildMembers(context.Background(), connect.NewRequest(&matchv1.ListGuildMembersRequest{
		GuildId: "",
		Game:    commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- JoinQueue ---

func TestMatchJoinQueue_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.JoinQueue(context.Background(), connect.NewRequest(&matchv1.JoinQueueRequest{
		GuildId:              "guild-1",
		ChannelId:            "ch-1",
		CaptainDiscordUserId: "u1",
		Game:                 commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchJoinQueue_EmptyGuildID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.JoinQueue(context.Background(), connect.NewRequest(&matchv1.JoinQueueRequest{
		GuildId:              "",
		ChannelId:            "ch-1",
		CaptainDiscordUserId: "u1",
		Game:                 commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchJoinQueue_EmptyChannelID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.JoinQueue(context.Background(), connect.NewRequest(&matchv1.JoinQueueRequest{
		GuildId:              "guild-1",
		ChannelId:            "",
		CaptainDiscordUserId: "u1",
		Game:                 commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchJoinQueue_EmptyCaptain(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.JoinQueue(context.Background(), connect.NewRequest(&matchv1.JoinQueueRequest{
		GuildId:              "guild-1",
		ChannelId:            "ch-1",
		CaptainDiscordUserId: "",
		Game:                 commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- LeaveQueue ---

func TestMatchLeaveQueue_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.LeaveQueue(context.Background(), connect.NewRequest(&matchv1.LeaveQueueRequest{
		CaptainDiscordUserId: "u1",
		Game:                 commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchLeaveQueue_EmptyCaptain(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.LeaveQueue(context.Background(), connect.NewRequest(&matchv1.LeaveQueueRequest{
		CaptainDiscordUserId: "  ",
		Game:                 commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- GetQueueStatus ---

func TestMatchGetQueueStatus_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.GetQueueStatus(context.Background(), connect.NewRequest(&matchv1.GetQueueStatusRequest{
		DiscordUserId: "u1",
		GuildId:       "guild-1",
		Game:          commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchGetQueueStatus_EmptyGuildID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.GetQueueStatus(context.Background(), connect.NewRequest(&matchv1.GetQueueStatusRequest{
		DiscordUserId: "u1",
		GuildId:       "",
		Game:          commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchGetQueueStatus_EmptyDiscordID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.GetQueueStatus(context.Background(), connect.NewRequest(&matchv1.GetQueueStatusRequest{
		DiscordUserId: "",
		GuildId:       "guild-1",
		Game:          commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- CreateCustomMatch ---

func TestMatchCreateCustomMatch_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.CreateCustomMatch(context.Background(), connect.NewRequest(&matchv1.CreateCustomMatchRequest{
		GuildId:                "guild-1",
		ChannelId:              "ch-1",
		CreatedByDiscordUserId: "u1",
		Game:                   commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchCreateCustomMatch_EmptyGuildID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.CreateCustomMatch(context.Background(), connect.NewRequest(&matchv1.CreateCustomMatchRequest{
		GuildId:                "",
		ChannelId:              "ch-1",
		CreatedByDiscordUserId: "u1",
		Game:                   commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchCreateCustomMatch_EmptyChannelID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.CreateCustomMatch(context.Background(), connect.NewRequest(&matchv1.CreateCustomMatchRequest{
		GuildId:                "guild-1",
		ChannelId:              "",
		CreatedByDiscordUserId: "u1",
		Game:                   commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchCreateCustomMatch_EmptyCreatedBy(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.CreateCustomMatch(context.Background(), connect.NewRequest(&matchv1.CreateCustomMatchRequest{
		GuildId:                "guild-1",
		ChannelId:              "ch-1",
		CreatedByDiscordUserId: "",
		Game:                   commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- ReportMatchResult ---

func TestMatchReportMatchResult_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ReportMatchResult(context.Background(), connect.NewRequest(&matchv1.ReportMatchResultRequest{
		MatchId:     1,
		Game:        commonv1.Game_GAME_UNSPECIFIED,
		WinningTeam: "a",
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchReportMatchResult_InvalidWinningTeam(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ReportMatchResult(context.Background(), connect.NewRequest(&matchv1.ReportMatchResultRequest{
		MatchId:     1,
		Game:        commonv1.Game_GAME_R6,
		WinningTeam: "c",
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchReportMatchResult_EmptyWinningTeam(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ReportMatchResult(context.Background(), connect.NewRequest(&matchv1.ReportMatchResultRequest{
		MatchId:     1,
		Game:        commonv1.Game_GAME_R6,
		WinningTeam: "  ",
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- GetMatch ---

func TestMatchGetMatch_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.GetMatch(context.Background(), connect.NewRequest(&matchv1.GetMatchRequest{
		MatchId: 1,
		Game:    commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- ListMatches ---

func TestMatchListMatches_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ListMatches(context.Background(), connect.NewRequest(&matchv1.ListMatchesRequest{
		GuildId: "guild-1",
		Game:    commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchListMatches_EmptyGuildID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ListMatches(context.Background(), connect.NewRequest(&matchv1.ListMatchesRequest{
		GuildId: "",
		Game:    commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchListMatches_InvalidCursor(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ListMatches(context.Background(), connect.NewRequest(&matchv1.ListMatchesRequest{
		GuildId: "guild-1",
		Game:    commonv1.Game_GAME_R6,
		Cursor:  "not-base64!!!",
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

// --- GetMatchByUuid ---

func TestMatchGetMatchByUuid_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.GetMatchByUuid(context.Background(), connect.NewRequest(&matchv1.GetMatchByUuidRequest{
		PublicUuid: "550e8400-e29b-41d4-a716-446655440000",
		Game:       commonv1.Game_GAME_UNSPECIFIED,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchGetMatchByUuid_InvalidUUID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.GetMatchByUuid(context.Background(), connect.NewRequest(&matchv1.GetMatchByUuidRequest{
		PublicUuid: "not-a-uuid",
		Game:       commonv1.Game_GAME_R6,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}
