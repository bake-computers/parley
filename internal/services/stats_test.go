package services

import (
	"context"
	"testing"

	statsv1 "github.com/pactum-computers/parley/gen/parley/stats/v1"
	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/cache"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

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

type fakeCacheStore struct {
	fetchFn     func(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error)
	fetchCollFn func(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

func (f *fakeCacheStore) Fetch(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
	return f.fetchFn(ctx, game, username, platform, season)
}
func (f *fakeCacheStore) FetchCollection(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return f.fetchCollFn(ctx, game, username, platform)
}

func sampleStats(username string) scrape.ScrapedStats {
	return scrape.ScrapedStats{
		Profile:           scrape.StatsProfile{Username: username, Level: 100, Platform: "pc"},
		RankedStats:       scrape.RankedStats{Season: "y9s1", RankPoints: 3200, KDRatio: 1.5},
		CalculatedMetrics: scrape.CalculatedMetrics{KOST: 0.65},
	}
}

func sampleCollection(username string) scrape.ScrapedStatsCollection {
	return scrape.ScrapedStatsCollection{
		Latest: sampleStats(username),
		BySeason: map[string]scrape.ScrapedStats{
			"y9s1": sampleStats(username),
		},
		SeasonCatalog: []scrape.SeasonCatalogEntry{
			{Slug: "y9s1", Display: "Year 9 Season 1"},
		},
	}
}

func TestStatsService_FetchStats_CacheHit(t *testing.T) {
	want := sampleStats("alice")
	store := &fakeCacheStore{
		fetchFn: func(_ context.Context, _ backends.Game, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return want, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	svc := NewStatsService(store, reg)

	result, err := svc.FetchStats(context.Background(), "alice", fetch.StatsPlatformPC, "", backends.GameR6)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", result.Profile.Username, "alice")
	}
	if result.RankedStats.RankPoints != 3200 {
		t.Errorf("rank_points = %d, want 3200", result.RankedStats.RankPoints)
	}
}

func TestStatsService_FetchStats_CacheMiss_BackendCalled(t *testing.T) {
	want := sampleStats("bob")
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, username string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			if username != "bob" {
				t.Errorf("backend called with username %q, want %q", username, "bob")
			}
			return want, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	svc := NewStatsService(nil, reg)

	result, err := svc.FetchStats(context.Background(), "bob", fetch.StatsPlatformAuto, "y9s1", backends.GameR6)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Profile.Username != "bob" {
		t.Errorf("username = %q, want %q", result.Profile.Username, "bob")
	}
}

func TestStatsService_FetchStats_CacheMiss_BackendError(t *testing.T) {
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return scrape.ScrapedStats{}, fetch.NewStatsFetchError(fetch.StatsFetchErrorProfileNotFound, "not found", false)
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	svc := NewStatsService(nil, reg)

	_, err := svc.FetchStats(context.Background(), "nobody", fetch.StatsPlatformPC, "", backends.GameR6)
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

func TestStatsService_FetchStats_CacheError_Propagates(t *testing.T) {
	store := &fakeCacheStore{
		fetchFn: func(_ context.Context, _ backends.Game, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return scrape.ScrapedStats{}, fetch.NewStatsFetchError(fetch.StatsFetchErrorGcUnavailable, "redis down", true)
		},
	}
	reg := backends.NewStatsBackendRegistry()
	svc := NewStatsService(store, reg)

	_, err := svc.FetchStats(context.Background(), "alice", fetch.StatsPlatformPC, "", backends.GameR6)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	ferr, ok := err.(*fetch.StatsFetchError)
	if !ok {
		t.Fatalf("error type = %T, want *fetch.StatsFetchError", err)
	}
	if ferr.Kind != fetch.StatsFetchErrorGcUnavailable {
		t.Errorf("kind = %v, want GcUnavailable", ferr.Kind)
	}
}

func TestStatsService_FetchStats_SeasonSelector(t *testing.T) {
	var capturedSeason *string
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
			capturedSeason = season
			return sampleStats("alice"), nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)
	svc := NewStatsService(nil, reg)

	_, err := svc.FetchStats(context.Background(), "alice", fetch.StatsPlatformPC, "y9s2", backends.GameR6)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedSeason == nil || *capturedSeason != "y9s2" {
		t.Errorf("season = %v, want %q", capturedSeason, "y9s2")
	}
}

func TestStatsService_FetchStats_EmptySeasonBecomesNil(t *testing.T) {
	var capturedSeason *string
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
			capturedSeason = season
			return sampleStats("alice"), nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)
	svc := NewStatsService(nil, reg)

	_, err := svc.FetchStats(context.Background(), "alice", fetch.StatsPlatformPC, "  ", backends.GameR6)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedSeason != nil {
		t.Errorf("season = %v, want nil for empty/whitespace input", capturedSeason)
	}
}

func TestStatsService_FetchStatsCollection_WithCache(t *testing.T) {
	want := sampleCollection("alice")
	store := &fakeCacheStore{
		fetchCollFn: func(_ context.Context, _ backends.Game, _ string, _ fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return want, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	svc := NewStatsService(store, reg)

	got, err := svc.FetchStatsCollection(context.Background(), "alice", fetch.StatsPlatformAuto, backends.GameR6)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Latest.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Latest.Profile.Username, "alice")
	}
	if len(got.BySeason) != 1 {
		t.Errorf("by_season len = %d, want 1", len(got.BySeason))
	}
	if len(got.SeasonCatalog) != 1 {
		t.Errorf("season_catalog len = %d, want 1", len(got.SeasonCatalog))
	}
}

func TestStatsService_FetchStatsCollection_NoCache(t *testing.T) {
	want := sampleCollection("bob")
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchCollFn: func(_ context.Context, _ string, _ fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return want, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)
	svc := NewStatsService(nil, reg)

	got, err := svc.FetchStatsCollection(context.Background(), "bob", fetch.StatsPlatformPC, backends.GameR6)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Latest.Profile.Username != "bob" {
		t.Errorf("username = %q, want %q", got.Latest.Profile.Username, "bob")
	}
}

func TestStatsService_FetchStatsCollection_BackendError(t *testing.T) {
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchCollFn: func(_ context.Context, _ string, _ fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return scrape.ScrapedStatsCollection{}, fetch.NewStatsFetchError(fetch.StatsFetchErrorProfileNotFound, "not found", false)
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)
	svc := NewStatsService(nil, reg)

	_, err := svc.FetchStatsCollection(context.Background(), "nobody", fetch.StatsPlatformPC, backends.GameR6)
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

func TestMapProtoPlatform(t *testing.T) {
	tests := []struct {
		input statsv1.StatsPlatform
		want  fetch.StatsPlatform
	}{
		{statsv1.StatsPlatform_STATS_PLATFORM_UNSPECIFIED, fetch.StatsPlatformAuto},
		{statsv1.StatsPlatform_STATS_PLATFORM_AUTO, fetch.StatsPlatformAuto},
		{statsv1.StatsPlatform_STATS_PLATFORM_PC, fetch.StatsPlatformPC},
		{statsv1.StatsPlatform_STATS_PLATFORM_XBOX, fetch.StatsPlatformXbox},
		{statsv1.StatsPlatform_STATS_PLATFORM_PLAYSTATION, fetch.StatsPlatformPlaystation},
		{statsv1.StatsPlatform(99), fetch.StatsPlatformAuto},
	}
	for _, tt := range tests {
		got := MapProtoPlatform(tt.input)
		if got != tt.want {
			t.Errorf("MapProtoPlatform(%d) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestProtoFromScraped(t *testing.T) {
	domain := sampleStats("alice")
	proto := ProtoFromScraped(&domain)

	if proto.GetProfile().GetUsername() != "alice" {
		t.Errorf("profile.username = %q, want %q", proto.GetProfile().GetUsername(), "alice")
	}
	if proto.GetProfile().GetLevel() != 100 {
		t.Errorf("profile.level = %d, want 100", proto.GetProfile().GetLevel())
	}
	if proto.GetRankedStats().GetRankPoints() != 3200 {
		t.Errorf("ranked_stats.rank_points = %d, want 3200", proto.GetRankedStats().GetRankPoints())
	}
	if proto.GetRankedStats().GetKdRatio() != 1.5 {
		t.Errorf("ranked_stats.kd_ratio = %f, want 1.5", proto.GetRankedStats().GetKdRatio())
	}
	if proto.GetCalculatedMetrics().GetKost() != 0.65 {
		t.Errorf("calculated_metrics.kost = %f, want 0.65", proto.GetCalculatedMetrics().GetKost())
	}
}

func TestProtoFromCollection(t *testing.T) {
	domain := sampleCollection("bob")
	proto := ProtoFromCollection(&domain)

	if proto.GetLatest().GetProfile().GetUsername() != "bob" {
		t.Errorf("latest.username = %q, want %q", proto.GetLatest().GetProfile().GetUsername(), "bob")
	}
	if len(proto.GetBySeason()) != 1 {
		t.Errorf("by_season len = %d, want 1", len(proto.GetBySeason()))
	}
	s, ok := proto.GetBySeason()["y9s1"]
	if !ok {
		t.Fatal("by_season missing key 'y9s1'")
	}
	if s.GetProfile().GetUsername() != "bob" {
		t.Errorf("by_season[y9s1].username = %q, want %q", s.GetProfile().GetUsername(), "bob")
	}
	if len(proto.GetSeasonCatalog()) != 1 {
		t.Errorf("season_catalog len = %d, want 1", len(proto.GetSeasonCatalog()))
	}
	if proto.GetSeasonCatalog()[0].GetSlug() != "y9s1" {
		t.Errorf("season_catalog[0].slug = %q, want %q", proto.GetSeasonCatalog()[0].GetSlug(), "y9s1")
	}
}

func TestProtoFromFetchError(t *testing.T) {
	ferr := fetch.NewStatsFetchError(fetch.StatsFetchErrorProfileNotFound, "player not found", false)
	proto := ProtoFromFetchError(ferr)

	if proto.GetCode() != "ProfileNotFound" {
		t.Errorf("code = %q, want %q", proto.GetCode(), "ProfileNotFound")
	}
	if proto.GetMessage() != "player not found" {
		t.Errorf("message = %q, want %q", proto.GetMessage(), "player not found")
	}
}

// ensure fakeCacheStore implements cache.CacheStore
var _ cache.CacheStore = (*fakeCacheStore)(nil)
