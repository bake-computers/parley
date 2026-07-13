package services

import (
	"context"
	"testing"

	statsv1 "github.com/pactum-computers/parley/gen/parley/stats/v1"
	"github.com/pactum-computers/parley/internal/stats/cache"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

type fakeCacheStore struct {
	season *string
	stats  scrape.ScrapedStats
	coll   scrape.ScrapedStatsCollection
	err    error
}

func (f *fakeCacheStore) Fetch(_ context.Context, _ string, _ fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
	f.season = season
	return f.stats, f.err
}
func (f *fakeCacheStore) FetchCollection(context.Context, string, fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return f.coll, f.err
}

var _ cache.CacheStore = (*fakeCacheStore)(nil)

func TestStatsServiceFetchNormalizesSeason(t *testing.T) {
	store := &fakeCacheStore{stats: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "alice"}}}
	svc := NewStatsService(store)
	if _, err := svc.FetchStats(context.Background(), "alice", fetch.StatsPlatformPC, "  "); err != nil {
		t.Fatal(err)
	}
	if store.season != nil {
		t.Fatalf("season = %v, want nil", store.season)
	}
	if _, err := svc.FetchStats(context.Background(), "alice", fetch.StatsPlatformPC, "y9s1"); err != nil {
		t.Fatal(err)
	}
	if store.season == nil || *store.season != "y9s1" {
		t.Fatalf("season = %v", store.season)
	}
}

func TestStatsServicePropagatesCacheError(t *testing.T) {
	want := fetch.NewStatsFetchError(fetch.StatsFetchErrorProfileNotFound, "not found", false)
	_, err := NewStatsService(&fakeCacheStore{err: want}).FetchStats(context.Background(), "alice", fetch.StatsPlatformPC, "")
	if err != want {
		t.Fatalf("error = %v, want %v", err, want)
	}
}

func TestStatsServiceFetchCollection(t *testing.T) {
	want := scrape.ScrapedStatsCollection{Latest: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "alice"}}}
	got, err := NewStatsService(&fakeCacheStore{coll: want}).FetchStatsCollection(context.Background(), "alice", fetch.StatsPlatformAuto)
	if err != nil || got.Latest.Profile.Username != "alice" {
		t.Fatalf("got=%+v err=%v", got, err)
	}
}

func TestMapProtoPlatform(t *testing.T) {
	for _, tc := range []struct {
		in   statsv1.StatsPlatform
		want fetch.StatsPlatform
	}{
		{statsv1.StatsPlatform_STATS_PLATFORM_UNSPECIFIED, fetch.StatsPlatformAuto},
		{statsv1.StatsPlatform_STATS_PLATFORM_PC, fetch.StatsPlatformPC},
		{statsv1.StatsPlatform_STATS_PLATFORM_XBOX, fetch.StatsPlatformXbox},
		{statsv1.StatsPlatform_STATS_PLATFORM_PLAYSTATION, fetch.StatsPlatformPlaystation},
	} {
		if got := MapProtoPlatform(tc.in); got != tc.want {
			t.Fatalf("MapProtoPlatform(%v) = %v", tc.in, got)
		}
	}
}
