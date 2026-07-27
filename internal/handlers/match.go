package handlers

import (
	"context"

	"connectrpc.com/connect"
	matchv1 "github.com/bake-computers/parley/gen/parley/matchmaking/v1"
	"github.com/bake-computers/parley/gen/parley/matchmaking/v1/matchmakingv1connect"
	"github.com/bake-computers/parley/internal/services"
)

type MatchHandler struct {
	matchmakingv1connect.UnimplementedMatchmakingServiceHandler
	svc *services.MatchService
}

func NewMatchHandler(svc *services.MatchService) *MatchHandler {
	return &MatchHandler{svc: svc}
}

var _ matchmakingv1connect.MatchmakingServiceHandler = (*MatchHandler)(nil)

func (h *MatchHandler) BuildTeams(
	ctx context.Context,
	req *connect.Request[matchv1.BuildTeamsRequest],
) (*connect.Response[matchv1.BuildTeamsResponse], error) {
	resp, err := h.svc.BuildTeams(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *MatchHandler) ListGuildMembers(
	ctx context.Context,
	req *connect.Request[matchv1.ListGuildMembersRequest],
) (*connect.Response[matchv1.ListGuildMembersResponse], error) {
	resp, err := h.svc.ListGuildMembers(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *MatchHandler) CreateCustomMatch(
	ctx context.Context,
	req *connect.Request[matchv1.CreateCustomMatchRequest],
) (*connect.Response[matchv1.CreateCustomMatchResponse], error) {
	resp, err := h.svc.CreateCustomMatch(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *MatchHandler) ReportMatchResult(
	ctx context.Context,
	req *connect.Request[matchv1.ReportMatchResultRequest],
) (*connect.Response[matchv1.ReportMatchResultResponse], error) {
	resp, err := h.svc.ReportMatchResult(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *MatchHandler) GetMatch(
	ctx context.Context,
	req *connect.Request[matchv1.GetMatchRequest],
) (*connect.Response[matchv1.GetMatchResponse], error) {
	resp, err := h.svc.GetMatch(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *MatchHandler) ListMatches(
	ctx context.Context,
	req *connect.Request[matchv1.ListMatchesRequest],
) (*connect.Response[matchv1.ListMatchesResponse], error) {
	resp, err := h.svc.ListMatches(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *MatchHandler) GetMatchByUuid(
	ctx context.Context,
	req *connect.Request[matchv1.GetMatchByUuidRequest],
) (*connect.Response[matchv1.GetMatchByUuidResponse], error) {
	resp, err := h.svc.GetMatchByUuid(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}
