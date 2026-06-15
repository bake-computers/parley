package matchmaking_test

import (
	"math"
	"testing"

	"github.com/parley-bot/parley/internal/matchmaking"
)

// TestNormalizeStatClampsOutliers mirrors the Rust test
// normalize_stat_clamps_outliers. Z-score clamping caps at +3, so
// normalize(100, 1, 1) -> 1.0. std_dev=0 is the neutral floor -> 0.5.
func TestNormalizeStatClampsOutliers(t *testing.T) {
	t.Parallel()

	if got := matchmaking.NormalizeStat(100.0, 1.0, 1.0); math.Abs(got-1.0) > 1e-12 {
		t.Fatalf("normalize(100, 1, 1) = %v, want 1.0", got)
	}
	if got := matchmaking.NormalizeStat(1.0, 1.0, 0.0); math.Abs(got-0.5) > 1e-12 {
		t.Fatalf("normalize(1, 1, 0) = %v, want 0.5", got)
	}
}

// TestCPRNeutralIsAroundHalf mirrors cpr_weights_sum_positive. The
// neutral profile puts every stat at 0.5; weighted CPR sits in (0.4, 0.6).
func TestCPRNeutralIsAroundHalf(t *testing.T) {
	t.Parallel()

	cpr := matchmaking.CalculateCPR(matchmaking.NeutralPlayerMatchStats())
	if cpr <= 0.4 || cpr >= 0.6 {
		t.Fatalf("neutral cpr = %v, want 0.4 < cpr < 0.6", cpr)
	}
}

// TestPartitionTenPlayersFair mirrors partition_ten_players_is_fair.
// Builds a 10-player pool with linearly increasing skill, asks for two
// 5-player teams, asserts size 5/5 and win probability within 0.15 of 0.5.
func TestPartitionTenPlayersFair(t *testing.T) {
	t.Parallel()

	players := make([]matchmaking.RatedPlayer, 10)
	for i := 0; i < 10; i++ {
		players[i] = matchmaking.RatedPlayer{
			Mu:  1500.0 + float64(i)*50.0,
			Phi: 350.0,
			CPR: 0.4 + float64(i)*0.02,
		}
	}

	part := matchmaking.PartitionTeams(players, 5)
	if part == nil {
		t.Fatal("partition returned nil")
	}
	if len(part.TeamA) != 5 || len(part.TeamB) != 5 {
		t.Fatalf("team sizes = %d/%d, want 5/5", len(part.TeamA), len(part.TeamB))
	}
	if d := math.Abs(part.WinProbability - 0.5); d >= 0.15 {
		t.Fatalf("win_prob = %v, |p-0.5| = %v, want < 0.15", part.WinProbability, d)
	}
}

// TestParseTeamSizeHandlesFormats mirrors parse_team_size_handles_formats.
// Also covers an empty string and a malformed input, both of which should
// fall back to the default of 5.
func TestParseTeamSizeHandlesFormats(t *testing.T) {
	t.Parallel()

	if got := matchmaking.ParseTeamSize(strPtr("5v5")); got != 5 {
		t.Fatalf("5v5 -> %d, want 5", got)
	}
	if got := matchmaking.ParseTeamSize(strPtr("3v3")); got != 3 {
		t.Fatalf("3v3 -> %d, want 3", got)
	}
	if got := matchmaking.ParseTeamSize(nil); got != 5 {
		t.Fatalf("nil -> %d, want 5", got)
	}
	if got := matchmaking.ParseTeamSize(strPtr("")); got != 5 {
		t.Fatalf("empty -> %d, want 5", got)
	}
	if got := matchmaking.ParseTeamSize(strPtr("garbage")); got != 5 {
		t.Fatalf("garbage -> %d, want 5", got)
	}
}

// TestTeamWinProbabilityEqualTeams mirrors team_win_probability_equal_teams.
// Two identical 5-player rosters yield a 0.5 win probability.
func TestTeamWinProbabilityEqualTeams(t *testing.T) {
	t.Parallel()

	roster := matchmaking.TeamRoster{
		Members: []matchmaking.RosterMember{
			{Mu: 1500.0, Phi: 350.0},
			{Mu: 1500.0, Phi: 350.0},
			{Mu: 1500.0, Phi: 350.0},
			{Mu: 1500.0, Phi: 350.0},
			{Mu: 1500.0, Phi: 350.0},
		},
	}
	if p := matchmaking.TeamWinProbability(roster, roster); math.Abs(p-0.5) > 0.01 {
		t.Fatalf("win_prob = %v, want 0.5 ± 0.01", p)
	}
}

// TestPopulationNormsFromSamples is a sanity check on FromSamples for a
// constant input: mean equals the constant, std_dev is at machine
// epsilon (the floor).
func TestPopulationNormsFromSamples(t *testing.T) {
	t.Parallel()

	samples := []matchmaking.RawPlayerStats{
		{KD: 1.0}, {KD: 1.0}, {KD: 1.0},
	}
	norms := (&matchmaking.PopulationNorms{}).FromSamples(samples)
	if norms.KD.Mean != 1.0 {
		t.Fatalf("mean = %v, want 1.0", norms.KD.Mean)
	}
	if norms.KD.StdDev != math.SmallestNonzeroFloat64 {
		t.Fatalf("std_dev = %v, want machine epsilon", norms.KD.StdDev)
	}
}

// TestUpdateRatingAggressiveWin confirms a strong win against a similar
// opponent nudges mu upward.
func TestUpdateRatingAggressiveWin(t *testing.T) {
	t.Parallel()

	newMu, _ := matchmaking.UpdateRating(1500.0, 350.0, 1500.0, 350.0, 1.0, 0.6, 0.5)
	if newMu <= 1500.0 {
		t.Fatalf("newMu = %v, want > 1500 after a win", newMu)
	}
}

func strPtr(s string) *string { return &s }
