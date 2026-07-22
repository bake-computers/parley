package scrape

// PlayerSummary holds per-match round stats used for KOST estimation.
type PlayerSummary struct {
	Rounds             int32
	RoundSurvivals     int32
	Trades             int32
	OpeningKills       int32
	Kills              int32
	Deaths             int32
	OpeningDeaths      int32
	HeadshotOnlyRounds int32
	Clutch1v1Wins      int32
	Clutch1v2Wins      int32
	Clutch1v3Wins      int32
	Kills2K            int32
	Kills3K            int32
	Kills4K            int32
	Kills5K            int32
}

// MatchRoundTotals aggregates round-level stats across matches.
type MatchRoundTotals struct {
	RoundsPlayed       int32
	SurvivalRounds     int32
	TradedRounds       int32
	OpeningKillRounds  int32
	KillRounds         int32
	Kills              int32
	Deaths             int32
	OpeningDeaths      int32
	HeadshotOnlyRounds int32
	Clutch1v1Wins      int32
	Clutch1v2Wins      int32
	Clutch1v3Wins      int32
}

// SummarizePlayerSummaries aggregates KOST round inputs from match summaries.
func SummarizePlayerSummaries(summaries []PlayerSummary) MatchRoundTotals {
	var t MatchRoundTotals
	for _, s := range summaries {
		t.RoundsPlayed += s.Rounds
		t.SurvivalRounds += s.RoundSurvivals
		t.TradedRounds += s.Trades
		t.OpeningKillRounds += s.OpeningKills
		t.Kills += s.Kills
		t.Deaths += s.Deaths
		t.OpeningDeaths += s.OpeningDeaths
		t.HeadshotOnlyRounds += s.HeadshotOnlyRounds
		t.Clutch1v1Wins += s.Clutch1v1Wins
		t.Clutch1v2Wins += s.Clutch1v2Wins
		t.Clutch1v3Wins += s.Clutch1v3Wins
		roundsWithKill := s.Kills - s.Kills2K - 2*s.Kills3K - 3*s.Kills4K - 4*s.Kills5K
		if roundsWithKill < 0 {
			roundsWithKill = 0
		}
		if roundsWithKill > s.Rounds {
			roundsWithKill = s.Rounds
		}
		t.KillRounds += roundsWithKill
	}
	return t
}

const kostDescription = "Estimated KOST% from aggregated match summaries (no round-level K/O/S/T flags in payload)"

// BuildScrapedStats assembles profile + ranked stats with calculated KOST metrics.
func BuildScrapedStats(profile StatsProfile, ranked RankedStats) ScrapedStats {
	return ScrapedStats{
		Profile: profile,
		CalculatedMetrics: CalculatedMetrics{
			KOST:            CalculateKost(&ranked),
			KOSTLowerBound:  KostLowerBound(&ranked),
			KOSTUpperBound:  KostUpperBound(&ranked),
			KOSTDescription: kostDescription,
		},
		RankedStats: ranked,
	}
}
