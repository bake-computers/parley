package matchmaking

import (
	"encoding/json"
	"math"
	"strings"
	"testing"

	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
)

func TestPartitionModelTeamsBalancesRoles(t *testing.T) {
	players := make([]LoadedPlayer, 10)
	for i := range players {
		players[i].RawModelScore, players[i].DisplayModelScore = .5, .5
		if i < 5 {
			players[i].Roles[0] = 1
		} else {
			players[i].Roles[3] = 1
		}
	}
	p := PartitionModelTeams(players, 5, .10, .05)
	if p == nil || p.BalanceGap != 0 {
		t.Fatalf("partition=%+v", p)
	}
	if got := roleBalanceDelta(players, p.TeamA, p.TeamB); got > .20+1e-12 {
		t.Fatalf("role delta=%v", got)
	}
}

func TestPartitionModelTeamsBalanceGapMatchesDisplaySums(t *testing.T) {
	// Uneven display scores: gap must equal |sum(A) - sum(B)| of DisplayModelScore.
	players := make([]LoadedPlayer, 4)
	scores := []float64{0.9, 0.1, 0.8, 0.2}
	for i := range players {
		players[i].DisplayModelScore = scores[i]
		players[i].RawModelScore = scores[i] + 10 // raw must not drive BalanceGap
		players[i].Roles[i%4] = 1
	}
	p := PartitionModelTeams(players, 2, 0, 0)
	if p == nil {
		t.Fatal("nil partition")
	}
	var sumA, sumB float64
	for _, i := range p.TeamA {
		sumA += players[i].DisplayModelScore
	}
	for _, i := range p.TeamB {
		sumB += players[i].DisplayModelScore
	}
	want := math.Abs(sumA - sumB)
	if math.Abs(p.BalanceGap-want) > 1e-12 {
		t.Fatalf("BalanceGap=%v want %v (sumA=%v sumB=%v)", p.BalanceGap, want, sumA, sumB)
	}
}

func TestFeaturesFromSnapshotMatchOVIFormula(t *testing.T) {
	meta, _ := json.Marshal(map[string]int32{
		"rounds_played": 100, "rollup_kills": 120, "rollup_deaths": 100,
		"opening_kill_rounds": 30, "opening_death_rounds": 20, "traded_rounds": 40,
		"clutch_1v1_wins": 2, "clutch_1v2_wins": 3, "clutch_1v3_wins": 4,
		"headshot_only_rounds": 50,
	})
	var metadata map[string]any
	_ = json.Unmarshal(meta, &metadata)
	metadata["season_slug"] = "current"
	meta, _ = json.Marshal(metadata)
	f, _, err := featuresFromSnapshot(models.PlayerStatSnapshot{Matches: 10, KDRatio: 1.2, HeadshotPercentage: 60, WinRate: 55, Metadata: meta}, 3)
	if err != nil {
		t.Fatal(err)
	}
	want := [6]float64{1.2, .6, .4, .2, .55, .55}
	for i := range want {
		if math.Abs(f[i]-want[i]) > 1e-12 {
			t.Fatalf("feature %d = %v, want %v", i, f[i], want[i])
		}
	}
}

func TestFeaturesFromSnapshotRejectsMissingRollupKeys(t *testing.T) {
	// season_slug + rounds_played only — missing rollups must fail closed.
	meta, _ := json.Marshal(map[string]any{
		"season_slug":   "current",
		"rounds_played": 100,
	})
	_, _, err := featuresFromSnapshot(models.PlayerStatSnapshot{Matches: 10, Metadata: meta}, 3)
	if err == nil {
		t.Fatal("expected missing rollup keys to fail")
	}
}

func TestTournamentBalanceFallbackPrefersRankPoints(t *testing.T) {
	got := tournamentBalanceFallback(2537, 1200)
	want := 2537.0 / 4000.0
	if math.Abs(got-want) > 1e-12 {
		t.Fatalf("fallback=%v want %v", got, want)
	}
	if got := tournamentBalanceFallback(0, 1500); math.Abs(got-0.75) > 1e-12 {
		t.Fatalf("elo fallback=%v want 0.75", got)
	}
}

func TestScoreLoadedPlayerTournamentFallback(t *testing.T) {
	s := &Service{minSeasonMatches: 3}
	member := repos.GuildMemberRow{
		Username:        "Avqny",
		InternalElo:     1200,
		RatingDeviation: 350,
	}
	snap := models.PlayerStatSnapshot{Matches: 1, RankPoints: 2537}

	got, err := s.scoreLoadedPlayer(member, snap, true)
	if err != nil {
		t.Fatalf("fallback score: %v", err)
	}
	want := tournamentBalanceFallback(2537, 1200)
	if got.DisplayModelScore != want || got.Rated.CPR != want {
		t.Fatalf("display=%v cpr=%v want %v", got.DisplayModelScore, got.Rated.CPR, want)
	}

	_, err = s.scoreLoadedPlayer(member, snap, false)
	if err == nil || !strings.Contains(err.Error(), "needs at least 3 current-season ranked matches") {
		t.Fatalf("strict error=%v", err)
	}
}
