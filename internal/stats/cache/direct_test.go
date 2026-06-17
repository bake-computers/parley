package cache

import (
	"context"
	"testing"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// fakeBackend implements backends.StatsBackend for testing.
type fakeBackend struct {
	game        backends.Game
	fetchFn     func(ctx context.Context, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error)
	fetchCollFn func(ctx context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

func (f *fakeBackend) Game() backends.Game { return f.game }
func (f *fakeBackend) Fetch(ctx context.Context, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
	return f.fetchFn(ctx, username, platform, season)
}
func (f *fakeBackend) FetchCollection(ctx context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return f.fetchCollFn(ctx, username, platform)
}

func TestDirectCacheStore_Fetch_Passthrough(t *testing.T) {
	want := scrape.ScrapedStats{
		Profile:     scrape.StatsProfile{Username: "alice", Level: 100},
		RankedStats: scrape.RankedStats{RankPoints: 3200},
	}
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return want, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	store := NewDirectCacheStore(reg)
	got, err := store.Fetch(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Degraded {
		t.Error("Degraded should be false for DirectCacheStore")
	}
	if got.Stats.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Stats.Profile.Username, "alice")
	}
}

func TestDirectCacheStore_Fetch_PropagatesError(t *testing.T) {
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return scrape.ScrapedStats{}, fetch.NewStatsFetchError(fetch.StatsFetchErrorProfileNotFound, "not found", false)
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	store := NewDirectCacheStore(reg)
	_, err := store.Fetch(context.Background(), backends.GameR6, "nobody", fetch.StatsPlatformPC, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	ferr, ok := err.(*fetch.StatsFetchError)
	if !ok {
		t.Fatalf("error type = %T, want *fetch.StatsFetchError", err)
	}
	if ferr.Kind != fetch.StatsFetchErrorProfileNotFound {
		t.Errorf("kind = %v, want ProfileNotFound", ferr.Kind)
	}
}

func TestDirectCacheStore_FetchCollection_Passthrough(t *testing.T) {
	want := scrape.ScrapedStatsCollection{
		Latest: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "alice"}},
		BySeason: map[string]scrape.ScrapedStats{
			"y9s1": {Profile: scrape.StatsProfile{Username: "alice"}},
		},
	}
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchCollFn: func(_ context.Context, _ string, _ fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return want, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	store := NewDirectCacheStore(reg)
	got, err := store.FetchCollection(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformAuto)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Latest.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Latest.Profile.Username, "alice")
	}
}
