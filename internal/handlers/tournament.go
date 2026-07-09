package handlers

import (
	"context"

	"connectrpc.com/connect"
	tournamentv1 "github.com/pactum-computers/parley/gen/parley/tournament/v1"
	"github.com/pactum-computers/parley/gen/parley/tournament/v1/tournamentv1connect"
	"github.com/pactum-computers/parley/internal/services"
)

// TournamentHandler is a thin delegate over TournamentService. Every
// method forwards the request to the service and runs mapErr on the
// returned error so the connect envelope carries the right code.
type TournamentHandler struct {
	tournamentv1connect.UnimplementedTournamentServiceHandler
	svc *services.TournamentService
}

// NewTournamentHandler returns a handler backed by the given service.
func NewTournamentHandler(svc *services.TournamentService) *TournamentHandler {
	return &TournamentHandler{svc: svc}
}

var _ tournamentv1connect.TournamentServiceHandler = (*TournamentHandler)(nil)

func (h *TournamentHandler) CreateTournament(
	ctx context.Context,
	req *connect.Request[tournamentv1.CreateTournamentRequest],
) (*connect.Response[tournamentv1.TournamentResponse], error) {
	return h.svc.CreateTournament(ctx, req)
}

func (h *TournamentHandler) GetTournament(
	ctx context.Context,
	req *connect.Request[tournamentv1.GetTournamentRequest],
) (*connect.Response[tournamentv1.TournamentResponse], error) {
	return h.svc.GetTournament(ctx, req)
}

func (h *TournamentHandler) GetTournamentByCode(ctx context.Context, req *connect.Request[tournamentv1.GetTournamentByCodeRequest]) (*connect.Response[tournamentv1.TournamentResponse], error) {
	return h.svc.GetTournamentByCode(ctx, req)
}

func (h *TournamentHandler) ListTournaments(
	ctx context.Context,
	req *connect.Request[tournamentv1.ListTournamentsRequest],
) (*connect.Response[tournamentv1.ListTournamentsResponse], error) {
	return h.svc.ListTournaments(ctx, req)
}

func (h *TournamentHandler) RegisterTeam(
	ctx context.Context,
	req *connect.Request[tournamentv1.RegisterTeamRequest],
) (*connect.Response[tournamentv1.TeamResponse], error) {
	resp, err := h.svc.RegisterTeam(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *TournamentHandler) UpdateTeamRoster(
	ctx context.Context,
	req *connect.Request[tournamentv1.UpdateTeamRosterRequest],
) (*connect.Response[tournamentv1.TeamResponse], error) {
	resp, err := h.svc.UpdateTeamRoster(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *TournamentHandler) UnregisterTeam(
	ctx context.Context,
	req *connect.Request[tournamentv1.UnregisterTeamRequest],
) (*connect.Response[tournamentv1.TeamResponse], error) {
	resp, err := h.svc.UnregisterTeam(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *TournamentHandler) StartTournament(
	ctx context.Context,
	req *connect.Request[tournamentv1.StartTournamentRequest],
) (*connect.Response[tournamentv1.TournamentResponse], error) {
	resp, err := h.svc.StartTournament(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *TournamentHandler) ReportBracketResult(
	ctx context.Context,
	req *connect.Request[tournamentv1.ReportBracketResultRequest],
) (*connect.Response[tournamentv1.BracketMatchResponse], error) {
	resp, err := h.svc.ReportBracketResult(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *TournamentHandler) CancelTournament(
	ctx context.Context,
	req *connect.Request[tournamentv1.CancelTournamentRequest],
) (*connect.Response[tournamentv1.TournamentResponse], error) {
	resp, err := h.svc.CancelTournament(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}
