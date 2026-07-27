package api

import (
	"fmt"
	"net/url"
	"sort"
	"strings"

	"github.com/bake-computers/parley/internal/stats/scrape"
)

// MapInput holds everything needed to build a ScrapedStatsCollection.
type MapInput struct {
	Config   *Config
	Profile  *Profile
	Matches  []Match
	Username string
}

// MapCollection converts API payloads into the domain stats collection.
func MapCollection(in MapInput) scrape.ScrapedStatsCollection {
	if in.Config == nil || in.Profile == nil {
		return scrape.ScrapedStatsCollection{}
	}

	base := scrape.StatsProfile{
		Username:   in.Username,
		Level:      in.Profile.Level,
		ProfileID:  in.Profile.ID,
		Platform:   in.Profile.Platform,
		ProfileURL: profileURL(in.Username, in.Profile.ID),
	}

	rankedMode := in.Config.Constants.Slugs.RankedBombMode
	if rankedMode == "" {
		rankedMode = "ranked-bomb"
	}

	catalog := buildCatalog(in.Config, in.Profile.RankedSeasonRecords)
	bySeason := make(map[string]scrape.ScrapedStats, len(catalog))
	for _, entry := range catalog {
		rec, ok := in.Profile.RankedSeasonRecords[entry.Slug]
		if !ok {
			continue
		}
		mode := pickRankedMode(in.Profile.SeasonModeRecords[entry.Slug], rankedMode)
		seasonMatches := filterMatchesForSeason(in.Matches, entry.StartedAt)
		rounds := summarizeMatches(seasonMatches)
		ranked := buildRanked(in.Config, in.Profile.RankedSeasonRecords, entry, rec, mode, rounds, len(seasonMatches))
		bySeason[entry.Slug] = scrape.BuildScrapedStats(base, ranked)
	}

	var latest scrape.ScrapedStats
	if len(catalog) > 0 {
		if s, ok := bySeason[catalog[0].Slug]; ok {
			latest = s
		} else {
			latest = scrape.BuildScrapedStats(base, scrape.RankedStats{})
		}
	}

	return scrape.ScrapedStatsCollection{
		Latest:        latest,
		BySeason:      bySeason,
		SeasonCatalog: catalog,
	}
}

func profileURL(username, id string) string {
	return fmt.Sprintf("https://stats.cc/siege/%s/%s", url.PathEscape(username), id)
}

func buildCatalog(cfg *Config, records map[string]RankedSeasonRecord) []scrape.SeasonCatalogEntry {
	slugs := make([]string, 0, len(records))
	for slug := range records {
		slugs = append(slugs, slug)
	}
	sort.Slice(slugs, func(i, j int) bool {
		ls := seasonStartedAt(cfg, slugs[i])
		rs := seasonStartedAt(cfg, slugs[j])
		if ls == rs {
			return slugs[j] < slugs[i]
		}
		return rs < ls
	})
	out := make([]scrape.SeasonCatalogEntry, len(slugs))
	for i, slug := range slugs {
		meta := cfg.Seasons[slug]
		display := meta.Display
		if display == "" {
			display = slug
		}
		out[i] = scrape.SeasonCatalogEntry{
			Slug:      slug,
			Display:   display,
			StartedAt: meta.StartedAt,
		}
	}
	return out
}

func seasonStartedAt(cfg *Config, slug string) string {
	if m, ok := cfg.Seasons[slug]; ok {
		return m.StartedAt
	}
	return ""
}

func pickRankedMode(modes map[string]ModeRecord, rankedSlug string) *ModeRecord {
	if modes == nil {
		return nil
	}
	if r, ok := modes[rankedSlug]; ok {
		return &r
	}
	for _, r := range modes {
		if strings.Contains(r.Mode, "ranked") {
			cp := r
			return &cp
		}
	}
	return nil
}

func filterMatchesForSeason(matches []Match, seasonStart string) []Match {
	if seasonStart == "" {
		return matches
	}
	out := make([]Match, 0, len(matches))
	for _, m := range matches {
		if m.StartedAt >= seasonStart {
			out = append(out, m)
		}
	}
	return out
}

func summarizeMatches(matches []Match) scrape.MatchRoundTotals {
	summaries := make([]scrape.PlayerSummary, 0, len(matches))
	for _, m := range matches {
		if m.PlayerSummary == nil {
			continue
		}
		ps := m.PlayerSummary
		summaries = append(summaries, scrape.PlayerSummary{
			Rounds:             ps.Rounds,
			RoundSurvivals:     ps.RoundSurvivals,
			Trades:             ps.Trades,
			OpeningKills:       ps.OpeningKills,
			Kills:              ps.Kills,
			Deaths:             ps.Deaths,
			OpeningDeaths:      ps.OpeningDeaths,
			HeadshotOnlyRounds: ps.HeadshotOnlyRounds,
			Clutch1v1Wins:      ps.Clutch1v1Wins,
			Clutch1v2Wins:      ps.Clutch1v2Wins,
			Clutch1v3Wins:      ps.Clutch1v3Wins,
			Kills2K:            ps.Kills2K,
			Kills3K:            ps.Kills3K,
			Kills4K:            ps.Kills4K,
			Kills5K:            ps.Kills5K,
		})
	}
	return scrape.SummarizePlayerSummaries(summaries)
}

func buildRanked(
	cfg *Config,
	allRecords map[string]RankedSeasonRecord,
	entry scrape.SeasonCatalogEntry,
	rec RankedSeasonRecord,
	mode *ModeRecord,
	rounds scrape.MatchRoundTotals,
	matchCount int,
) scrape.RankedStats {
	currentRank, currentTier := rankLabel(cfg, rec.Rank)
	peakRank, peakTier := rankLabel(cfg, rec.MaxRank)

	allTimeSlug, allTimeSeason, allTimePts, allTimeRank, allTimeTier := allTimePeak(cfg, allRecords)

	ranked := scrape.RankedStats{
		Season:                entry.Slug,
		SeasonSlug:            entry.Slug,
		SeasonDisplay:         entry.Display,
		SeasonStartedAt:       entry.StartedAt,
		Mode:                  rankedModeName(mode),
		RankPoints:            rec.RankPoints,
		PeakRankPoints:        rec.MaxRankPoints,
		CurrentRankSlug:       rec.Rank,
		CurrentRank:           currentRank,
		CurrentRankTier:       currentTier,
		PeakRankSlug:          rec.MaxRank,
		PeakRank:              peakRank,
		PeakRankTier:          peakTier,
		AllTimePeakRankSlug:   allTimeSlug,
		AllTimePeakRank:       allTimeRank,
		AllTimePeakRankTier:   allTimeTier,
		AllTimePeakRankPoints: allTimePts,
		AllTimePeakRankSeason: allTimeSeason,
		RoundsPlayed:          rounds.RoundsPlayed,
		KillRounds:            rounds.KillRounds,
		SurvivalRounds:        rounds.SurvivalRounds,
		TradedRounds:          rounds.TradedRounds,
		OpeningKillRounds:     rounds.OpeningKillRounds,
		MatchesInCache:        int32(matchCount),
		RollupKills:           rounds.Kills,
		RollupDeaths:          rounds.Deaths,
		OpeningDeathRounds:    rounds.OpeningDeaths,
		HeadshotOnlyRounds:    rounds.HeadshotOnlyRounds,
		Clutch1v1Wins:         rounds.Clutch1v1Wins,
		Clutch1v2Wins:         rounds.Clutch1v2Wins,
		Clutch1v3Wins:         rounds.Clutch1v3Wins,
	}
	if mode != nil {
		ranked.Matches = mode.Matches
		ranked.Wins = mode.Wins
		ranked.Losses = mode.Losses
		ranked.Abandons = mode.Abandons
		ranked.Kills = mode.Kills
		ranked.Deaths = mode.Deaths
		ranked.Assists = mode.Assists
		ranked.Headshots = mode.Headshots
		ranked.KDRatio = scrape.RoundTo(mode.KD, 4)
		ranked.HeadshotPct = scrape.RoundTo(mode.HS, 2)
		ranked.WinRate = scrape.RoundTo(mode.WR, 2)
	}
	return ranked
}

func rankedModeName(mode *ModeRecord) string {
	if mode == nil {
		return "ranked"
	}
	return mode.Mode
}

func rankLabel(cfg *Config, slug string) (display, tier string) {
	if slug == "" {
		return "Unknown", "Unknown"
	}
	if r, ok := cfg.Ranks[slug]; ok {
		d := r.Display
		if d == "" {
			d = slug
		}
		t := "Unknown"
		if r.Tier != "" {
			if tm, ok := cfg.RankTiers[r.Tier]; ok && tm.Display != "" {
				t = tm.Display
			} else {
				t = r.Tier
			}
		}
		return d, t
	}
	return slug, "Unknown"
}

func allTimePeak(cfg *Config, records map[string]RankedSeasonRecord) (slug, season string, pts int32, rank, tier string) {
	var best RankedSeasonRecord
	for _, r := range records {
		if r.MaxRankPoints > best.MaxRankPoints {
			best = r
			season = r.Season
		}
	}
	if best.MaxRankPoints <= 0 {
		return "", "", 0, "Unknown", "Unknown"
	}
	slug = best.MaxRank
	rank, tier = rankLabel(cfg, slug)
	return slug, season, best.MaxRankPoints, rank, tier
}
