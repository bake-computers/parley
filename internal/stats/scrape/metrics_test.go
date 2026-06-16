package scrape

import "testing"

func sampleRankedStats() *RankedStats {
	return &RankedStats{
		RoundsPlayed:   100,
		KillRounds:     40,
		SurvivalRounds: 30,
		TradedRounds:   10,
	}
}

func TestZeroRoundsReturnsZero(t *testing.T) {
	stats := &RankedStats{}
	if CalculateKost(stats) != 0 {
		t.Errorf("CalculateKost zero rounds: got %v, want 0", CalculateKost(stats))
	}
	if KostLowerBound(stats) != 0 {
		t.Errorf("KostLowerBound zero rounds: got %v, want 0", KostLowerBound(stats))
	}
	if KostUpperBound(stats) != 0 {
		t.Errorf("KostUpperBound zero rounds: got %v, want 0", KostUpperBound(stats))
	}
}

func TestKostMidpointMatchesTS(t *testing.T) {
	s := sampleRankedStats()
	if got := KostLowerBound(s); got != 40.0 {
		t.Errorf("KostLowerBound: got %v, want 40.0", got)
	}
	if got := KostUpperBound(s); got != 80.0 {
		t.Errorf("KostUpperBound: got %v, want 80.0", got)
	}
	if got := CalculateKost(s); got != 60.0 {
		t.Errorf("CalculateKost: got %v, want 60.0", got)
	}
}

func TestUpperIsClampedByTotalRounds(t *testing.T) {
	s := &RankedStats{
		RoundsPlayed:   10,
		KillRounds:     8,
		SurvivalRounds: 8,
		TradedRounds:   8,
	}
	if got := KostUpperBound(s); got != 100.0 {
		t.Errorf("KostUpperBound: got %v, want 100.0", got)
	}
}
