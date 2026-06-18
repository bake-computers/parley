package scrape

// PlayerSummary holds per-match round stats used for KOST estimation.
type PlayerSummary struct {
	Rounds         int32
	RoundSurvivals int32
	Trades         int32
	OpeningKills   int32
	Kills          int32
	Kills2K        int32
	Kills3K        int32
	Kills4K        int32
	Kills5K        int32
}

// MatchRoundTotals aggregates round-level stats across matches.
type MatchRoundTotals struct {
	RoundsPlayed      int32
	SurvivalRounds    int32
	TradedRounds      int32
	OpeningKillRounds int32
	KillRounds        int32
}

// SummarizePlayerSummaries aggregates KOST round inputs from match summaries.
func SummarizePlayerSummaries(summaries []PlayerSummary) MatchRoundTotals {
	var t MatchRoundTotals
	for _, s := range summaries {
		t.RoundsPlayed += s.Rounds
		t.SurvivalRounds += s.RoundSurvivals
		t.TradedRounds += s.Trades
		t.OpeningKillRounds += s.OpeningKills
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

// BuildScrapedStats assembles profile + ranked stats with calculated KOST metrics.
func BuildScrapedStats(profile StatsProfile, ranked RankedStats) ScrapedStats {
	return toScraped(profile, ranked)
}
