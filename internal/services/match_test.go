package services_test

import (
	"context"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	matchv1 "github.com/bake-computers/parley/gen/parley/matchmaking/v1"
	"github.com/bake-computers/parley/internal/services"
)

func newNilDBMatchService() *services.MatchService {
	return services.NewMatchService(nil, nil, nil)
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

// An attacker-supplied team_size must be rejected before it reaches the
// C(2t-1, t-1) subset enumeration in PartitionModelTeams (OOM DoS).
func TestMatchBuildTeams_TeamSizeTooLarge(t *testing.T) {
	svc := newNilDBMatchService()
	ids := make([]string, 32)
	for i := range ids {
		ids[i] = fmt.Sprintf("u%d", i)
	}
	_, err := svc.BuildTeams(context.Background(), connect.NewRequest(&matchv1.BuildTeamsRequest{
		GuildId:        "guild-1",
		Game:           commonv1.Game_GAME_R6,
		TeamSize:       16,
		DiscordUserIds: ids,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchCreateCustomMatch_TeamSizeTooLarge(t *testing.T) {
	svc := newNilDBMatchService()
	// Correctly sized for team_size=11 so the only invalid input is the
	// team size itself.
	ids := make([]string, 22)
	for i := range ids {
		ids[i] = fmt.Sprintf("u%d", i)
	}
	_, err := svc.CreateCustomMatch(context.Background(), connect.NewRequest(&matchv1.CreateCustomMatchRequest{
		GuildId:                "guild-1",
		ChannelId:              "chan-1",
		CreatedByDiscordUserId: "u1",
		Game:                   commonv1.Game_GAME_R6,
		TeamSize:               11,
		DiscordUserIds:         ids,
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

// --- ReportPlayerRoundStats ---

func TestMatchReportPlayerRoundStats_UnspecifiedGame(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ReportPlayerRoundStats(context.Background(), connect.NewRequest(&matchv1.ReportPlayerRoundStatsRequest{
		MatchId: 1,
		Game:    commonv1.Game_GAME_UNSPECIFIED,
		Stats:   []*matchv1.PlayerRoundStat{{DiscordUserId: "u1", Kills: 1}},
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchReportPlayerRoundStats_EmptyStats(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ReportPlayerRoundStats(context.Background(), connect.NewRequest(&matchv1.ReportPlayerRoundStatsRequest{
		MatchId: 1,
		Game:    commonv1.Game_GAME_R6,
		Stats:   nil,
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchReportPlayerRoundStats_NegativeValue(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ReportPlayerRoundStats(context.Background(), connect.NewRequest(&matchv1.ReportPlayerRoundStatsRequest{
		MatchId: 1,
		Game:    commonv1.Game_GAME_R6,
		Stats:   []*matchv1.PlayerRoundStat{{DiscordUserId: "u1", Kills: -1}},
	}))
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestMatchReportPlayerRoundStats_EmptyDiscordUserID(t *testing.T) {
	svc := newNilDBMatchService()
	_, err := svc.ReportPlayerRoundStats(context.Background(), connect.NewRequest(&matchv1.ReportPlayerRoundStatsRequest{
		MatchId: 1,
		Game:    commonv1.Game_GAME_R6,
		Stats:   []*matchv1.PlayerRoundStat{{DiscordUserId: "  ", Kills: 1}},
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
