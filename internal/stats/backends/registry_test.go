package backends_test

import (
	"context"
	"errors"
	"testing"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

type stubBackend struct {
	game backends.Game
}

func (s *stubBackend) Game() backends.Game { return s.game }

func (s *stubBackend) Fetch(context.Context, string, fetch.StatsPlatform, *string) (scrape.ScrapedStats, error) {
	return scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "stub"}}, nil
}

func (s *stubBackend) FetchCollection(context.Context, string, fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return scrape.ScrapedStatsCollection{
		Latest: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "stub-coll"}},
	}, nil
}

func TestStatsBackendRegistry_RegisterGetHas(t *testing.T) {
	reg := backends.NewStatsBackendRegistry()
	if reg.Has(backends.GameR6) {
		t.Fatal("expected empty registry")
	}
	b := &stubBackend{game: backends.GameR6}
	reg.Register(b)
	if !reg.Has(backends.GameR6) {
		t.Fatal("expected R6 registered")
	}
	got, ok := reg.Get(backends.GameR6)
	if !ok || got.Game() != backends.GameR6 {
		t.Fatalf("Get: ok=%v game=%v", ok, got.Game())
	}
}

func TestStatsBackendRegistry_FetchUnavailable(t *testing.T) {
	reg := backends.NewStatsBackendRegistry()
	ctx := context.Background()
	_, err := reg.Fetch(ctx, backends.GameR6, "user", fetch.StatsPlatformPC, nil)
	var fe *fetch.StatsFetchError
	if !errors.As(err, &fe) {
		t.Fatalf("expected StatsFetchError, got %T %v", err, err)
	}
	if fe.Kind != fetch.StatsFetchErrorGcUnavailable || !fe.Retryable {
		t.Fatalf("unexpected error: %+v", fe)
	}
	if fe.Message != "no backend registered for game=r6" {
		t.Fatalf("message: %q", fe.Message)
	}
}

func TestStatsBackendRegistry_FetchDelegates(t *testing.T) {
	reg := backends.NewStatsBackendRegistry()
	reg.Register(&stubBackend{game: backends.GameR6})
	ctx := context.Background()
	stats, err := reg.Fetch(ctx, backends.GameR6, "x", fetch.StatsPlatformAuto, nil)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Profile.Username != "stub" {
		t.Fatalf("username %q", stats.Profile.Username)
	}
}

func TestGame_String(t *testing.T) {
	if backends.GameR6.String() != "r6" {
		t.Fatalf("got %q", backends.GameR6.String())
	}
}
