package handlers_test

import (
	"context"
	"errors"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	leaderboardv1 "github.com/parley-bot/parley/gen/parley/leaderboard/v1"
	"github.com/parley-bot/parley/internal/handlers"
	"github.com/parley-bot/parley/internal/services"
	"github.com/parley-bot/parley/internal/stats/backends"
	"github.com/parley-bot/parley/internal/stats/scrape"
)

func TestGetLeaderboard_NotConfigured(t *testing.T) {
	h := handlers.NewLeaderboardHandler(services.NewLeaderboardService(nil))
	req := connect.NewRequest(&leaderboardv1.GetLeaderboardRequest{
		Game:  commonv1.Game_GAME_R6,
		Type:  leaderboardv1.LeaderboardType_LEADERBOARD_TYPE_ELO,
		Limit: 10,
	})
	_, err := h.GetLeaderboard(context.Background(), req)
	if err == nil {
		t.Fatal("expected error")
	}
	var ce *connect.Error
	if !errors.As(err, &ce) || ce.Code() != connect.CodeFailedPrecondition {
		t.Fatalf("got %v", err)
	}
}

func TestGetLeaderboard_HappyPath(t *testing.T) {
	store := &fakeLeaderboardStore{
		top: []services.Entry{{PlayerID: "alice", Rank: 1, Score: 99}},
		cnt: 1,
	}
	h := handlers.NewLeaderboardHandler(services.NewLeaderboardService(store))
	req := connect.NewRequest(&leaderboardv1.GetLeaderboardRequest{
		Game:  commonv1.Game_GAME_R6,
		Type:  leaderboardv1.LeaderboardType_LEADERBOARD_TYPE_ELO,
		Limit: 10,
	})
	resp, err := h.GetLeaderboard(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Msg.Entries) != 1 || resp.Msg.TotalCount != 1 {
		t.Fatalf("got %+v", resp.Msg)
	}
	if resp.Msg.Entries[0].Username != "alice" {
		t.Fatalf("username=%q", resp.Msg.Entries[0].Username)
	}
}

type fakeLeaderboardStore struct {
	top []services.Entry
	cnt int64
}

func (f *fakeLeaderboardStore) Touch(context.Context, backends.Game, string, string, *scrape.ScrapedStats) error {
	return nil
}

func (f *fakeLeaderboardStore) Top(context.Context, backends.Game, string, services.Kind, int64, int64) ([]services.Entry, error) {
	return f.top, nil
}

func (f *fakeLeaderboardStore) PlayerRank(context.Context, backends.Game, string, services.Kind, string) (*services.Entry, error) {
	return nil, nil
}

func (f *fakeLeaderboardStore) Count(context.Context, backends.Game, string, services.Kind) (int64, error) {
	return f.cnt, nil
}

func (f *fakeLeaderboardStore) Remove(context.Context, backends.Game, string, string) error {
	return nil
}
