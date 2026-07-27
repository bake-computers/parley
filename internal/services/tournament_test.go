package services_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	tournamentv1 "github.com/bake-computers/parley/gen/parley/tournament/v1"
	"github.com/bake-computers/parley/internal/services"
)

// newNilDBTournamentService wires a TournamentService with all nil
// dependencies. Only the early game-validation paths can be exercised
// without a real database; every other RPC will surface a nil-pointer
// panic if invoked.
func newNilDBTournamentService() *services.TournamentService {
	return services.NewTournamentService(nil, nil, nil, nil, nil, nil)
}

func TestCreateTournament_UnspecifiedGame(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.CreateTournamentRequest{
		Name:    "Spring Showdown",
		Game:    commonv1.Game_GAME_UNSPECIFIED,
		TeamCap: 4,
	})
	_, err := svc.CreateTournament(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestCreateTournament_EmptyName(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.CreateTournamentRequest{
		Name:    "   ",
		Game:    commonv1.Game_GAME_R6,
		TeamCap: 4,
	})
	_, err := svc.CreateTournament(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestCreateTournament_TeamCapTooSmall(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.CreateTournamentRequest{
		Name:    "Spring Showdown",
		Game:    commonv1.Game_GAME_R6,
		TeamCap: 1,
	})
	_, err := svc.CreateTournament(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestGetTournament_UnspecifiedGame(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.GetTournamentRequest{
		Game: commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := svc.GetTournament(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestListTournaments_UnspecifiedGame(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.ListTournamentsRequest{
		Game: commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := svc.ListTournaments(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestRegisterTeam_UnspecifiedGame(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.RegisterTeamRequest{
		Game: commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := svc.RegisterTeam(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUpdateTeamRoster_UnspecifiedGame(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.UpdateTeamRosterRequest{
		Game: commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := svc.UpdateTeamRoster(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUnregisterTeam_UnspecifiedGame(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.UnregisterTeamRequest{
		Game: commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := svc.UnregisterTeam(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestStartTournament_UnspecifiedGame(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.StartTournamentRequest{
		Game: commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := svc.StartTournament(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestReportBracketResult_UnspecifiedGame(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.ReportBracketResultRequest{
		Game: commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := svc.ReportBracketResult(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestCancelTournament_UnspecifiedGame(t *testing.T) {
	svc := newNilDBTournamentService()
	req := connect.NewRequest(&tournamentv1.CancelTournamentRequest{
		Game: commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := svc.CancelTournament(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}
