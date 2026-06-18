package scrape

import "testing"

func TestSummarizePlayerSummaries(t *testing.T) {
	totals := SummarizePlayerSummaries([]PlayerSummary{{
		Rounds: 5, RoundSurvivals: 4, Trades: 1, OpeningKills: 2,
		Kills: 8, Kills2K: 1, Kills3K: 1,
	}})
	if totals.RoundsPlayed != 5 {
		t.Fatalf("rounds = %d", totals.RoundsPlayed)
	}
	if totals.KillRounds != 5 {
		t.Fatalf("kill_rounds = %d, want 5", totals.KillRounds)
	}
}
