package handlers_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/pactum-computers/parley/gen/parley/common/v1"
	leaderboardv1 "github.com/pactum-computers/parley/gen/parley/leaderboard/v1"
	"github.com/pactum-computers/parley/internal/handlers"
	"github.com/pactum-computers/parley/internal/services"
	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

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
