package backends_test

import (
	"context"
	"testing"

	"github.com/parley-bot/parley/internal/stats/backends"
	"github.com/parley-bot/parley/internal/stats/fetch"
	"github.com/parley-bot/parley/internal/stats/scrape"
)

type mockClient struct {
	fetchStatsFn      func(context.Context, string, fetch.StatsPlatform, *string) (scrape.ScrapedStats, error)
	fetchCollectionFn func(context.Context, string, fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

func (m *mockClient) FetchStats(ctx context.Context, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
	return m.fetchStatsFn(ctx, username, platform, season)
}

func (m *mockClient) FetchStatsCollection(ctx context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return m.fetchCollectionFn(ctx, username, platform)
}

func TestR6Backend_Game(t *testing.T) {
	b := backends.NewR6Backend(&mockClient{})
	if b.Game() != backends.GameR6 {
		t.Fatalf("game %v", b.Game())
	}
}

func TestR6Backend_FetchDelegatesToClient(t *testing.T) {
	ctx := context.Background()
	season := "y9s4"
	client := &mockClient{
		fetchStatsFn: func(_ context.Context, username string, platform fetch.StatsPlatform, s *string) (scrape.ScrapedStats, error) {
			if username != "SiegePlayer" || platform != fetch.StatsPlatformXbox {
				t.Fatalf("args username=%q platform=%v", username, platform)
			}
			if s == nil || *s != season {
				t.Fatalf("season %v", s)
			}
			return scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: username}}, nil
		},
		fetchCollectionFn: func(context.Context, string, fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			t.Fatal("collection should not be called")
			return scrape.ScrapedStatsCollection{}, nil
		},
	}
	b := backends.NewR6Backend(client)
	stats, err := b.Fetch(ctx, "SiegePlayer", fetch.StatsPlatformXbox, &season)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Profile.Username != "SiegePlayer" {
		t.Fatalf("got %q", stats.Profile.Username)
	}
}

func TestR6Backend_FetchCollectionDelegatesToClient(t *testing.T) {
	ctx := context.Background()
	client := &mockClient{
		fetchStatsFn: func(context.Context, string, fetch.StatsPlatform, *string) (scrape.ScrapedStats, error) {
			t.Fatal("fetch should not be called")
			return scrape.ScrapedStats{}, nil
		},
		fetchCollectionFn: func(_ context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			if username != "coll-user" || platform != fetch.StatsPlatformPC {
				t.Fatalf("args username=%q platform=%v", username, platform)
			}
			return scrape.ScrapedStatsCollection{
				BySeason: map[string]scrape.ScrapedStats{"s1": {}},
			}, nil
		},
	}
	b := backends.NewR6Backend(client)
	coll, err := b.FetchCollection(ctx, "coll-user", fetch.StatsPlatformPC)
	if err != nil {
		t.Fatal(err)
	}
	if len(coll.BySeason) != 1 {
		t.Fatalf("by_season len %d", len(coll.BySeason))
	}
}

func TestR6Backend_RegistryIntegration(t *testing.T) {
	client := &mockClient{
		fetchStatsFn: func(context.Context, string, fetch.StatsPlatform, *string) (scrape.ScrapedStats, error) {
			return scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "from-r6"}}, nil
		},
		fetchCollectionFn: func(context.Context, string, fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return scrape.ScrapedStatsCollection{}, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backends.NewR6Backend(client))
	stats, err := reg.Fetch(context.Background(), backends.GameR6, "u", fetch.StatsPlatformAuto, nil)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Profile.Username != "from-r6" {
		t.Fatalf("got %q", stats.Profile.Username)
	}
}
