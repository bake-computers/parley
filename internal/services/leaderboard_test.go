package services_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/pactum-computers/parley/internal/services"
	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/scrape"
	"github.com/redis/go-redis/v9"
)

func TestRedisStoreKeyGlobalElo(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()

	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	store := services.NewRedisStore(client)

	stats := scrape.ScrapedStats{
		RankedStats: scrape.RankedStats{RankPoints: 2500, WinRate: 55.5},
	}
	if err := store.Touch(context.Background(), backends.GameR6, "", "player-1", &stats); err != nil {
		t.Fatal(err)
	}

	got, err := store.PlayerRank(context.Background(), backends.GameR6, "", services.KindElo, "player-1")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("expected entry")
	}
	if got.Rank != 1 || got.Score != 2500 {
		t.Fatalf("got rank=%d score=%v", got.Rank, got.Score)
	}
}

func TestRedisStoreTopPagination(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	store := services.NewRedisStore(client)
	ctx := context.Background()

	for i, score := range []float64{100, 200, 300} {
		id := fmt.Sprintf("p%c", 'a'+i)
		s := scrape.ScrapedStats{RankedStats: scrape.RankedStats{RankPoints: int32(score), WinRate: score}}
		if err := store.Touch(ctx, backends.GameR6, "guild1", id, &s); err != nil {
			t.Fatal(err)
		}
	}

	top, err := store.Top(ctx, backends.GameR6, "guild1", services.KindElo, 2, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(top) != 2 || top[0].Rank != 2 || top[0].PlayerID != "pb" {
		t.Fatalf("unexpected top: %+v", top)
	}
}

func TestLeaderboardServiceNilStoreFailedPrecondition(t *testing.T) {
	svc := services.NewLeaderboardService(nil)
	_, err := svc.GetLeaderboard(context.Background(), services.GetLeaderboardParams{
		Game: backends.GameR6, GuildID: "", Kind: services.KindElo, Limit: 10, Offset: 0,
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if !services.IsNotConfigured(err) {
		t.Fatalf("want not configured, got %v", err)
	}
}
