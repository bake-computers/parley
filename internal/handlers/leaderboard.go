package handlers

import (
	"context"

	"connectrpc.com/connect"
	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	leaderboardv1 "github.com/parley-bot/parley/gen/parley/leaderboard/v1"
	"github.com/parley-bot/parley/gen/parley/leaderboard/v1/leaderboardv1connect"
	"github.com/parley-bot/parley/internal/apperr"
	"github.com/parley-bot/parley/internal/services"
	"github.com/parley-bot/parley/internal/stats/backends"
)

// LeaderboardHandler serves parley.leaderboard.v1.LeaderboardService.
type LeaderboardHandler struct {
	leaderboardv1connect.UnimplementedLeaderboardServiceHandler
	svc *services.LeaderboardService
}

// NewLeaderboardHandler returns a handler backed by the given service.
func NewLeaderboardHandler(svc *services.LeaderboardService) *LeaderboardHandler {
	return &LeaderboardHandler{svc: svc}
}

var _ leaderboardv1connect.LeaderboardServiceHandler = (*LeaderboardHandler)(nil)

func mapLeaderboardType(t leaderboardv1.LeaderboardType) services.Kind {
	switch t {
	case leaderboardv1.LeaderboardType_LEADERBOARD_TYPE_WIN_RATE:
		return services.KindWinRate
	case leaderboardv1.LeaderboardType_LEADERBOARD_TYPE_RANK_POINTS:
		return services.KindRankPoints
	case leaderboardv1.LeaderboardType_LEADERBOARD_TYPE_ELO:
		return services.KindElo
	default:
		return services.KindElo
	}
}

func mapLeaderboardProtoGame(g commonv1.Game) backends.Game {
	switch g {
	case commonv1.Game_GAME_R6:
		return backends.GameR6
	default:
		return backends.GameR6
	}
}

func leaderboardProtoEntry(e services.Entry) *leaderboardv1.LeaderboardEntry {
	return &leaderboardv1.LeaderboardEntry{
		PlayerId: e.PlayerID,
		Username: e.PlayerID,
		Rank:     e.Rank,
		Score:    e.Score,
		Matches:  0,
		Wins:     0,
		Losses:   0,
		WinRate:  0,
	}
}

func mapLeaderboardErr(err error) error {
	if services.IsNotConfigured(err) {
		return apperr.FailedPrecondition(err.Error())
	}
	return mapErr(err)
}

// GetLeaderboard returns a page of ranked players from Redis.
func (h *LeaderboardHandler) GetLeaderboard(
	ctx context.Context,
	req *connect.Request[leaderboardv1.GetLeaderboardRequest],
) (*connect.Response[leaderboardv1.GetLeaderboardResponse], error) {
	r := req.Msg
	result, err := h.svc.GetLeaderboard(ctx, services.GetLeaderboardParams{
		Game:    mapLeaderboardProtoGame(r.GetGame()),
		GuildID: r.GetGuildId(),
		Kind:    mapLeaderboardType(r.GetType()),
		Limit:   r.GetLimit(),
		Offset:  r.GetOffset(),
	})
	if err != nil {
		return nil, mapLeaderboardErr(err)
	}
	entries := make([]*leaderboardv1.LeaderboardEntry, 0, len(result.Entries))
	for _, e := range result.Entries {
		entries = append(entries, leaderboardProtoEntry(e))
	}
	return connect.NewResponse(&leaderboardv1.GetLeaderboardResponse{
		Entries:    entries,
		TotalCount: result.TotalCount,
	}), nil
}

// GetPlayerRank returns one player's rank or an empty entry when not listed.
func (h *LeaderboardHandler) GetPlayerRank(
	ctx context.Context,
	req *connect.Request[leaderboardv1.GetPlayerRankRequest],
) (*connect.Response[leaderboardv1.GetPlayerRankResponse], error) {
	r := req.Msg
	entry, err := h.svc.GetPlayerRank(ctx, services.GetPlayerRankParams{
		Game:     mapLeaderboardProtoGame(r.GetGame()),
		GuildID:  r.GetGuildId(),
		PlayerID: r.GetPlayerId(),
		Kind:     mapLeaderboardType(r.GetType()),
	})
	if err != nil {
		return nil, mapLeaderboardErr(err)
	}
	var proto *leaderboardv1.LeaderboardEntry
	if entry != nil {
		proto = leaderboardProtoEntry(*entry)
	}
	return connect.NewResponse(&leaderboardv1.GetPlayerRankResponse{Entry: proto}), nil
}
