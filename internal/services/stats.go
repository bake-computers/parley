package services

import (
	"context"
	"strings"

	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	statsv1 "github.com/parley-bot/parley/gen/parley/stats/v1"
	"github.com/parley-bot/parley/internal/stats/backends"
	"github.com/parley-bot/parley/internal/stats/cache"
	"github.com/parley-bot/parley/internal/stats/fetch"
	"github.com/parley-bot/parley/internal/stats/scrape"
)

// StatsService fetches player stats through the cache→backend→fetch pipeline.
// Mirrors Rust StatsHandler.
type StatsService struct {
	cache    cache.CacheStore
	registry *backends.StatsBackendRegistry
}

// NewStatsService creates a StatsService. cache may be nil (degraded mode).
func NewStatsService(
	cacheStore cache.CacheStore,
	registry *backends.StatsBackendRegistry,
) *StatsService {
	return &StatsService{cache: cacheStore, registry: registry}
}

// FetchResult wraps the result of a single-season stats fetch.
type FetchResult struct {
	Stats    scrape.ScrapedStats
	Degraded bool
}

// FetchStats fetches stats for a single season selector (or latest when empty).
// Mirrors Rust StatsHandler::fetch_stats_rpc.
func (s *StatsService) FetchStats(
	ctx context.Context,
	username string,
	platform fetch.StatsPlatform,
	seasonSelector string,
	game backends.Game,
) (FetchResult, error) {
	season := emptyToNil(seasonSelector)

	if s.cache != nil {
		cached, err := s.cache.Fetch(ctx, game, username, platform, season)
		if err != nil {
			return FetchResult{}, err
		}
		return FetchResult{Stats: cached.Stats, Degraded: cached.Degraded}, nil
	}

	// No cache — call backend registry directly.
	stats, err := s.registry.Fetch(ctx, game, username, platform, season)
	if err != nil {
		return FetchResult{}, err
	}
	return FetchResult{Stats: stats, Degraded: false}, nil
}

// FetchStatsCollection fetches stats for every ranked season.
// Mirrors Rust StatsHandler::fetch_stats_collection_rpc.
func (s *StatsService) FetchStatsCollection(
	ctx context.Context,
	username string,
	platform fetch.StatsPlatform,
	game backends.Game,
) (scrape.ScrapedStatsCollection, error) {
	if s.cache != nil {
		return s.cache.FetchCollection(ctx, game, username, platform)
	}
	return s.registry.FetchCollection(ctx, game, username, platform)
}

// --- Proto conversion helpers ---

// MapProtoPlatform converts proto StatsPlatform to fetch.StatsPlatform.
func MapProtoPlatform(p statsv1.StatsPlatform) fetch.StatsPlatform {
	switch p {
	case statsv1.StatsPlatform_STATS_PLATFORM_PC:
		return fetch.StatsPlatformPC
	case statsv1.StatsPlatform_STATS_PLATFORM_XBOX:
		return fetch.StatsPlatformXbox
	case statsv1.StatsPlatform_STATS_PLATFORM_PLAYSTATION:
		return fetch.StatsPlatformPlaystation
	default:
		return fetch.StatsPlatformAuto
	}
}

// MapProtoGame converts proto Game to backends.Game. Defaults to GameR6 for
// GAME_UNSPECIFIED so existing clients keep working (matches Rust behavior).
func MapProtoGame(_ commonv1.Game) backends.Game {
	return backends.GameR6
}

// ProtoFromScraped converts a domain ScrapedStats to proto ScrapedStats.
func ProtoFromScraped(s *scrape.ScrapedStats) *statsv1.ScrapedStats {
	return &statsv1.ScrapedStats{
		Profile:           ProtoFromProfile(&s.Profile),
		RankedStats:       ProtoFromRanked(&s.RankedStats),
		CalculatedMetrics: ProtoFromMetrics(&s.CalculatedMetrics),
	}
}

// ProtoFromProfile converts a domain StatsProfile to proto StatsProfile.
func ProtoFromProfile(p *scrape.StatsProfile) *statsv1.StatsProfile {
	return &statsv1.StatsProfile{
		Username:   p.Username,
		Level:      p.Level,
		ProfileId:  p.ProfileID,
		Platform:   p.Platform,
		ProfileUrl: p.ProfileURL,
	}
}

// ProtoFromRanked converts a domain RankedStats to proto RankedStats.
func ProtoFromRanked(r *scrape.RankedStats) *statsv1.RankedStats {
	return &statsv1.RankedStats{
		Season:                r.Season,
		SeasonSlug:            r.SeasonSlug,
		SeasonDisplay:         r.SeasonDisplay,
		SeasonStartedAt:       r.SeasonStartedAt,
		Mode:                  r.Mode,
		Matches:               r.Matches,
		Wins:                  r.Wins,
		Losses:                r.Losses,
		Abandons:              r.Abandons,
		Kills:                 r.Kills,
		Deaths:                r.Deaths,
		Assists:               r.Assists,
		Headshots:             r.Headshots,
		KdRatio:               r.KDRatio,
		HeadshotPercentage:    r.HeadshotPct,
		WinRate:               r.WinRate,
		RankPoints:            r.RankPoints,
		PeakRankPoints:        r.PeakRankPoints,
		CurrentRankSlug:       r.CurrentRankSlug,
		CurrentRank:           r.CurrentRank,
		CurrentRankTier:       r.CurrentRankTier,
		PeakRankSlug:          r.PeakRankSlug,
		PeakRank:              r.PeakRank,
		PeakRankTier:          r.PeakRankTier,
		AllTimePeakRankSlug:   r.AllTimePeakRankSlug,
		AllTimePeakRank:       r.AllTimePeakRank,
		AllTimePeakRankTier:   r.AllTimePeakRankTier,
		AllTimePeakRankPoints: r.AllTimePeakRankPoints,
		AllTimePeakRankSeason: r.AllTimePeakRankSeason,
		RoundsPlayed:          r.RoundsPlayed,
		KillRounds:            r.KillRounds,
		SurvivalRounds:        r.SurvivalRounds,
		TradedRounds:          r.TradedRounds,
		OpeningKillRounds:     r.OpeningKillRounds,
		MatchesInCache:        r.MatchesInCache,
	}
}

// ProtoFromMetrics converts domain CalculatedMetrics to proto CalculatedMetrics.
func ProtoFromMetrics(m *scrape.CalculatedMetrics) *statsv1.CalculatedMetrics {
	return &statsv1.CalculatedMetrics{
		Kost:            m.KOST,
		KostLowerBound:  m.KOSTLowerBound,
		KostUpperBound:  m.KOSTUpperBound,
		KostDescription: m.KOSTDescription,
	}
}

// ProtoFromCollection converts domain ScrapedStatsCollection to proto.
func ProtoFromCollection(c *scrape.ScrapedStatsCollection) *statsv1.ScrapedStatsCollection {
	bySeason := make(map[string]*statsv1.ScrapedStats, len(c.BySeason))
	for slug, stats := range c.BySeason {
		s := stats // copy for pointer stability
		bySeason[slug] = ProtoFromScraped(&s)
	}
	catalog := make([]*statsv1.SeasonCatalogEntry, 0, len(c.SeasonCatalog))
	for _, e := range c.SeasonCatalog {
		catalog = append(catalog, &statsv1.SeasonCatalogEntry{
			Slug:      e.Slug,
			Display:   e.Display,
			StartedAt: e.StartedAt,
		})
	}
	latest := ProtoFromScraped(&c.Latest)
	return &statsv1.ScrapedStatsCollection{
		Latest:        latest,
		BySeason:      bySeason,
		SeasonCatalog: catalog,
	}
}

// ProtoFromFetchError converts a StatsFetchError to a proto Error.
func ProtoFromFetchError(e *fetch.StatsFetchError) *commonv1.Error {
	return &commonv1.Error{
		Code:    e.Kind.String(),
		Message: e.Message,
	}
}

func emptyToNil(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return &s
}
