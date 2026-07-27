package services

import (
	"context"
	"strings"

	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	statsv1 "github.com/bake-computers/parley/gen/parley/stats/v1"
	"github.com/bake-computers/parley/internal/stats/cache"
	"github.com/bake-computers/parley/internal/stats/fetch"
	"github.com/bake-computers/parley/internal/stats/scrape"
)

// StatsService fetches player stats through the cache→fetch pipeline.
type StatsService struct {
	cache cache.CacheStore
}

// NewStatsService creates a StatsService. cache must be non-nil in production.
func NewStatsService(
	cacheStore cache.CacheStore,
) *StatsService {
	return &StatsService{cache: cacheStore}
}

// FetchStats fetches stats for a single season selector (or latest when empty).
func (s *StatsService) FetchStats(
	ctx context.Context,
	username string,
	platform fetch.StatsPlatform,
	seasonSelector string,
) (scrape.ScrapedStats, error) {
	season := emptyToNil(seasonSelector)
	return s.cache.Fetch(ctx, username, platform, season)
}

// FetchStatsCollection fetches stats for every ranked season.
func (s *StatsService) FetchStatsCollection(
	ctx context.Context,
	username string,
	platform fetch.StatsPlatform,
) (scrape.ScrapedStatsCollection, error) {
	return s.cache.FetchCollection(ctx, username, platform)
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
		s := stats
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
