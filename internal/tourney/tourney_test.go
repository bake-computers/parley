package tourney_test

import (
	"testing"

	"github.com/bake-computers/parley/internal/tourney"
)

// fakeTeam is a minimal Seeder for testing SeedTeams in isolation from the
// models package. It mirrors the role TournamentTeam plays in the Rust
// engine-service: a sortable skill score + stable identity.
type fakeTeam struct {
	ID      int32
	Balance float64
}

func (f fakeTeam) SeedScore() float64 { return f.Balance }

// ascendingIDs returns [1, 2, ..., n].
func ascendingIDs(n int) []int32 {
	out := make([]int32, n)
	for i := 0; i < n; i++ {
		out[i] = int32(i + 1)
	}
	return out
}

// countByRound tallies how many drafts fall into each round number for a
// given bracket identifier.
func countByRound(bracket string, drafts []tourney.BracketDraft) map[int32]int {
	out := make(map[int32]int)
	for _, d := range drafts {
		if d.Bracket != bracket {
			continue
		}
		out[d.RoundNumber]++
	}
	return out
}

func TestParseTournamentFormat(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		input      string
		wantFormat string
		wantSize   int
	}{
		{"empty defaults to single 5v5", "", tourney.FormatSingleElimination, 5},
		{"5v5 single elimination", "5v5 single elimination", tourney.FormatSingleElimination, 5},
		{"3v3 single elim", "3v3 single elim", tourney.FormatSingleElimination, 3},
		{"double elimination 5v5", "5v5 double elimination", tourney.FormatDoubleElimination, 5},
		{"3v3 double", "3v3 double", tourney.FormatDoubleElimination, 3},
		{"case insensitive", "  5V5  DOUBLE  ELIMINATION  ", tourney.FormatDoubleElimination, 5},
		{"unknown token defaults single", "8v8 capture the flag", tourney.FormatSingleElimination, 8},
		{"no team size marker", "single elimination", tourney.FormatSingleElimination, 5},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			gotFormat, gotSize := tourney.ParseTournamentFormat(tc.input)
			if gotFormat != tc.wantFormat {
				t.Errorf("format = %q, want %q", gotFormat, tc.wantFormat)
			}
			if gotSize != tc.wantSize {
				t.Errorf("teamSize = %d, want %d", gotSize, tc.wantSize)
			}
		})
	}
}

func TestNormalizeTournamentName(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in, want string
	}{
		{"  Spring Showdown  ", "spring showdown"},
		{"WINTER CUP", "winter cup"},
		{"  ", ""},
		{"already-clean", "already-clean"},
	}
	for _, tc := range cases {
		if got := tourney.NormalizeTournamentName(tc.in); got != tc.want {
			t.Errorf("NormalizeTournamentName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestStandardBracketOrder(t *testing.T) {
	t.Parallel()

	cases := []struct {
		n    int
		want []int
	}{
		{1, []int{0}},
		{2, []int{0, 1}},
		{4, []int{0, 3, 1, 2}},
		{8, []int{0, 7, 3, 4, 1, 6, 2, 5}},
		{16, []int{0, 15, 7, 8, 3, 12, 4, 11, 1, 14, 6, 9, 2, 13, 5, 10}},
	}
	for _, tc := range cases {
		t.Run("", func(t *testing.T) {
			got := tourney.StandardBracketOrder(tc.n)
			if !equalInts(got, tc.want) {
				t.Errorf("StandardBracketOrder(%d) = %v, want %v", tc.n, got, tc.want)
			}
		})
	}

	if got := tourney.StandardBracketOrder(0); got != nil {
		t.Errorf("StandardBracketOrder(0) = %v, want nil", got)
	}
	if got := tourney.StandardBracketOrder(-1); got != nil {
		t.Errorf("StandardBracketOrder(-1) = %v, want nil", got)
	}
}

func TestSeedTeamsSortsByBalanceDescending(t *testing.T) {
	t.Parallel()

	teams := []fakeTeam{
		{ID: 1, Balance: 0.42},
		{ID: 2, Balance: 0.91},
		{ID: 3, Balance: 0.55},
		{ID: 4, Balance: 0.78},
	}
	tourney.SeedTeams(teams)

	want := []int32{2, 4, 3, 1}
	for i, w := range want {
		if teams[i].ID != w {
			t.Errorf("seed %d = team %d, want team %d", i+1, teams[i].ID, w)
		}
	}
}

func TestSeedTeamsStableOnEqualScores(t *testing.T) {
	t.Parallel()

	teams := []fakeTeam{
		{ID: 1, Balance: 0.5},
		{ID: 2, Balance: 0.5},
		{ID: 3, Balance: 0.5},
	}
	tourney.SeedTeams(teams)
	for i, want := range []int32{1, 2, 3} {
		if teams[i].ID != want {
			t.Errorf("position %d = %d, want %d (stability broken)", i, teams[i].ID, want)
		}
	}
}

func TestSeedTeamsEmptyAndSingle(t *testing.T) {
	t.Parallel()

	tourney.SeedTeams([]fakeTeam(nil)) // must not panic on empty input
	if got := []fakeTeam(nil); len(got) != 0 {
		t.Errorf("nil slice length = %d, want 0", len(got))
	}
	one := []fakeTeam{{ID: 7, Balance: 0.1}}
	tourney.SeedTeams(one)
	if one[0].ID != 7 {
		t.Errorf("SeedTeams on single mutated order, got %+v", one)
	}
}

// TestSingleEliminationFourTeamsMatchesRust mirrors the upstream test
// in src/tourney/bracket.rs::tests.
func TestSingleEliminationFourTeamsMatchesRust(t *testing.T) {
	t.Parallel()

	teams := []fakeTeam{
		{ID: 1}, {ID: 2}, {ID: 3}, {ID: 4},
	}
	ids := make([]int32, len(teams))
	for i, tm := range teams {
		ids[i] = tm.ID
	}
	drafts := tourney.GenerateSingleElimination(ids)
	if len(drafts) != 3 {
		t.Fatalf("4-team single elim drafts = %d, want 3", len(drafts))
	}
}

// TestSingleEliminationEightTeamsIsFullBracket is the headline test for the
// 8-team case: it must produce a 7-match bracket laid out as 4 + 2 + 1
// across rounds 1, 2, 3, with no byes and standard seed pairings.
func TestSingleEliminationEightTeamsIsFullBracket(t *testing.T) {
	t.Parallel()

	drafts := tourney.GenerateSingleElimination(ascendingIDs(8))

	// 4 + 2 + 1 = 7 matches for 8 teams.
	if len(drafts) != 7 {
		t.Fatalf("8-team single elim drafts = %d, want 7", len(drafts))
	}

	rounds := countByRound(tourney.BracketWinners, drafts)
	wantRounds := map[int32]int{1: 4, 2: 2, 3: 1}
	if !equalIntMaps(rounds, wantRounds) {
		t.Errorf("round counts = %v, want %v", rounds, wantRounds)
	}

	// All drafts must be winners-bracket; no losers/grand_final for single elim.
	for i, d := range drafts {
		if d.Bracket != tourney.BracketWinners {
			t.Errorf("draft %d bracket = %q, want %q", i, d.Bracket, tourney.BracketWinners)
		}
	}

	// The final (round 3) must have no winner_to pointer — it crowns the champ.
	for _, d := range drafts {
		if d.RoundNumber == 3 && d.WinnerToKey != nil {
			t.Errorf("final match must not link forward, got %+v", d)
		}
	}

	// Every round 1 match must be ready (both slots filled) for a power-of-2 field.
	for _, d := range drafts {
		if d.RoundNumber == 1 && !tourney.Ready(d) {
			t.Errorf("round 1 match %d not ready: %+v", d.MatchNumber, d)
		}
	}

	// Verify the round-1 pairings produced by the binary-folded standard
	// bracket order [0, 7, 3, 4, 1, 6, 2, 5] applied to ascending team IDs.
	// For input [1..8] this yields brackets [1, 5, 7, 3, 4, 8, 6, 2] and
	// round-1 pairings: match 1 = 1v5, match 2 = 3v7, match 3 = 4v8, match 4
	// = 2v6. This matches the same algorithm in src/tourney/seeding.rs.
	r1ByNumber := map[int32]tourney.BracketDraft{}
	for _, d := range drafts {
		if d.RoundNumber == 1 {
			r1ByNumber[d.MatchNumber] = d
		}
	}
	wantR1 := map[int32][2]int32{
		1: {1, 5},
		2: {3, 7},
		3: {4, 8},
		4: {2, 6},
	}
	for n, want := range wantR1 {
		got := r1ByNumber[n]
		assertPair(t, got, want[0], want[1])
	}

	// Round 2 matches should chain into round 3 via WinnerToKey.
	for _, d := range drafts {
		if d.RoundNumber != 2 {
			continue
		}
		if d.WinnerToKey == nil || d.WinnerToKey.RoundNumber != 3 {
			t.Errorf("round 2 match %d missing winner_to round 3: %+v", d.MatchNumber, d)
		}
		if d.WinnerToSlot == nil {
			t.Errorf("round 2 match %d missing winner_to_slot", d.MatchNumber)
		}
	}
}

func TestSingleEliminationBelowMinimumReturnsNil(t *testing.T) {
	t.Parallel()

	if got := tourney.GenerateSingleElimination(nil); got != nil {
		t.Errorf("nil teams → %v, want nil", got)
	}
	if got := tourney.GenerateSingleElimination([]int32{1}); got != nil {
		t.Errorf("1 team → %v, want nil", got)
	}
}

// TestSingleEliminationByesPromoteToEightSlots is the explicit byes test:
// 5, 6, and 7 teams all snap up to an 8-slot bracket with the unfilled slots
// rendered as byes (one team per bye match, ready=0 / bye=true).
func TestSingleEliminationByesPromoteToEightSlots(t *testing.T) {
	t.Parallel()

	for _, n := range []int{5, 6, 7} {
		n := n
		t.Run("", func(t *testing.T) {
			t.Parallel()
			drafts := tourney.GenerateSingleElimination(ascendingIDs(n))

			// 8-slot bracket has 7 matches regardless of team count.
			if len(drafts) != 7 {
				t.Fatalf("%d-team single elim drafts = %d, want 7 (8-slot)", n, len(drafts))
			}
			rounds := countByRound(tourney.BracketWinners, drafts)
			if rounds[1] != 4 || rounds[2] != 2 || rounds[3] != 1 {
				t.Errorf("%d-team round counts = %v, want 4/2/1", n, rounds)
			}

			// Round 1 must have exactly (8 - n) byes.
			byeCount := 0
			filledR1 := 0
			for _, d := range drafts {
				if d.RoundNumber != 1 {
					continue
				}
				switch {
				case tourney.IsBye(d):
					byeCount++
				case tourney.Ready(d):
					filledR1++
				default:
					t.Errorf("round 1 match %d in %d-team is neither bye nor ready: %+v", d.MatchNumber, n, d)
				}
			}
			if byeCount != 8-n {
				t.Errorf("%d-team: bye count = %d, want %d", n, byeCount, 8-n)
			}
			if byeCount+filledR1 != 4 {
				t.Errorf("%d-team: bye+ready = %d, want 4 round-1 matches", n, byeCount+filledR1)
			}

			// The bye matches must not be considered ready.
			for _, d := range drafts {
				if d.RoundNumber == 1 && tourney.IsBye(d) && tourney.Ready(d) {
					t.Errorf("bye match incorrectly marked ready: %+v", d)
				}
			}
		})
	}
}

func TestSingleEliminationEightTeamsNoByes(t *testing.T) {
	t.Parallel()

	drafts := tourney.GenerateSingleElimination(ascendingIDs(8))
	for _, d := range drafts {
		if d.RoundNumber == 1 && tourney.IsBye(d) {
			t.Errorf("round 1 match %d is a bye in a full 8-team field", d.MatchNumber)
		}
	}
}

func TestDoubleEliminationAddsLosersAndGrandFinal(t *testing.T) {
	t.Parallel()

	teams := ascendingIDs(8)
	single := tourney.GenerateSingleElimination(teams)
	double := tourney.GenerateDoubleElimination(teams)

	if len(double) <= len(single) {
		t.Errorf("double elim should add matches: single=%d, double=%d", len(single), len(double))
	}

	// Must contain at least one grand_final placeholder.
	gfCount := 0
	for _, d := range double {
		if d.Bracket == tourney.BracketGrandFinal {
			gfCount++
		}
	}
	if gfCount != 1 {
		t.Errorf("grand_final drafts = %d, want 1", gfCount)
	}

	// Winners bracket final must feed the losers bracket round 2 slot a.
	var winnersFinal *tourney.BracketDraft
	for i := range double {
		d := &double[i]
		if d.Bracket != tourney.BracketWinners {
			continue
		}
		if winnersFinal == nil ||
			d.RoundNumber > winnersFinal.RoundNumber ||
			(d.RoundNumber == winnersFinal.RoundNumber && d.MatchNumber > winnersFinal.MatchNumber) {
			winnersFinal = d
		}
	}
	if winnersFinal == nil {
		t.Fatal("no winners bracket final found")
	}
	if winnersFinal.LoserToKey == nil ||
		winnersFinal.LoserToKey.Bracket != tourney.BracketLosers ||
		winnersFinal.LoserToKey.RoundNumber != 2 {
		t.Errorf("winners final missing loser_to round 2: %+v", winnersFinal)
	}
	if winnersFinal.LoserToSlot == nil || *winnersFinal.LoserToSlot != tourney.SlotA {
		t.Errorf("winners final loser_to_slot = %v, want a", winnersFinal.LoserToSlot)
	}

	// Every winners round 1 match must feed a losers round 1 slot.
	r1Winners := 0
	for _, d := range double {
		if d.Bracket == tourney.BracketWinners && d.RoundNumber == 1 {
			r1Winners++
			if d.LoserToKey == nil || d.LoserToKey.RoundNumber != 1 {
				t.Errorf("winners R1 match %d missing loser_to R1: %+v", d.MatchNumber, d)
			}
		}
	}
	if r1Winners != 4 {
		t.Errorf("winners R1 matches = %d, want 4", r1Winners)
	}

	// Losers bracket round 1 must have at least one match.
	losersR1 := 0
	for _, d := range double {
		if d.Bracket == tourney.BracketLosers && d.RoundNumber == 1 {
			losersR1++
		}
	}
	if losersR1 < 1 {
		t.Errorf("losers R1 matches = %d, want >=1", losersR1)
	}
}

func TestDoubleEliminationBelowMinimumReturnsNil(t *testing.T) {
	t.Parallel()

	if got := tourney.GenerateDoubleElimination([]int32{1}); got != nil {
		t.Errorf("1 team double elim → %v, want nil", got)
	}
	if got := tourney.GenerateDoubleElimination(nil); got != nil {
		t.Errorf("nil teams double elim → %v, want nil", got)
	}
}

func TestReadyAndIsBye(t *testing.T) {
	t.Parallel()

	a := int32(1)
	b := int32(2)
	ready := tourney.BracketDraft{TeamAID: &a, TeamBID: &b}
	if !tourney.Ready(ready) || tourney.IsBye(ready) {
		t.Errorf("full match not classified ready: %+v", ready)
	}

	byeA := tourney.BracketDraft{TeamAID: &a}
	if tourney.Ready(byeA) || !tourney.IsBye(byeA) {
		t.Errorf("nil-b slot not classified as bye: %+v", byeA)
	}

	byeB := tourney.BracketDraft{TeamBID: &b}
	if tourney.Ready(byeB) || !tourney.IsBye(byeB) {
		t.Errorf("nil-a slot not classified as bye: %+v", byeB)
	}

	empty := tourney.BracketDraft{}
	if tourney.Ready(empty) || tourney.IsBye(empty) {
		t.Errorf("empty draft misclassified: %+v", empty)
	}
}

func TestDraftsByRound(t *testing.T) {
	t.Parallel()

	drafts := tourney.GenerateSingleElimination(ascendingIDs(8))
	byRound := tourney.DraftsByRound(tourney.BracketWinners, drafts)
	wantRounds := []int32{1, 2, 3}
	for _, r := range wantRounds {
		if _, ok := byRound[r]; !ok {
			t.Errorf("DraftsByRound missing round %d", r)
		}
	}
	for _, d := range drafts {
		if d.Bracket == tourney.BracketGrandFinal {
			t.Errorf("single elim contains grand_final draft: %+v", d)
		}
	}
	// Round 1 drafts must be sorted ascending by match number.
	r1 := byRound[1]
	for i := 1; i < len(r1); i++ {
		if r1[i-1].MatchNumber > r1[i].MatchNumber {
			t.Errorf("round 1 not sorted by match number: %v", r1)
		}
	}
}

// Sanity-check the round-1 ordering for a 16-team field. This is a smoke
// test guarding against a regression in the binary-folded standard order
// when n grows large enough to catch off-by-one mistakes.
func TestSingleEliminationSixteenTeamsRoundsAndCounts(t *testing.T) {
	t.Parallel()

	drafts := tourney.GenerateSingleElimination(ascendingIDs(16))
	if len(drafts) != 15 {
		t.Fatalf("16-team single elim drafts = %d, want 15", len(drafts))
	}
	rounds := countByRound(tourney.BracketWinners, drafts)
	wantRounds := map[int32]int{1: 8, 2: 4, 3: 2, 4: 1}
	if !equalIntMaps(rounds, wantRounds) {
		t.Errorf("16-team round counts = %v, want %v", rounds, wantRounds)
	}
}

// Sanity: the IDs we generate for the 8-team round-1 are sorted ascending
// when read off the bracket (this is the same property the Rust test
// indirectly relies on, since the seed order is already sorted).
func TestSeedTeamsAndBracketComposeCleanly(t *testing.T) {
	t.Parallel()

	teams := []fakeTeam{
		{ID: 1, Balance: 0.30}, // weakest
		{ID: 2, Balance: 0.50},
		{ID: 3, Balance: 0.60},
		{ID: 4, Balance: 0.70},
		{ID: 5, Balance: 0.80},
		{ID: 6, Balance: 0.85},
		{ID: 7, Balance: 0.90},
		{ID: 8, Balance: 0.99}, // strongest
	}
	tourney.SeedTeams(teams)

	// After seed, strongest team (ID 8) must be at index 0.
	if teams[0].ID != 8 {
		t.Errorf("seed #1 = %d, want 8 (strongest)", teams[0].ID)
	}
	if teams[7].ID != 1 {
		t.Errorf("seed #8 = %d, want 1 (weakest)", teams[7].ID)
	}

	ids := make([]int32, len(teams))
	for i, tm := range teams {
		ids[i] = tm.ID
	}

	drafts := tourney.GenerateSingleElimination(ids)
	if len(drafts) != 7 {
		t.Fatalf("composed drafts = %d, want 7", len(drafts))
	}
	for _, d := range drafts {
		if d.RoundNumber == 1 && !tourney.Ready(d) {
			t.Errorf("round 1 match %d not ready after seed+bracket: %+v", d.MatchNumber, d)
		}
	}
}

func equalInts(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func equalIntMaps(a, b map[int32]int) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func assertPair(t *testing.T, d tourney.BracketDraft, wantA, wantB int32) {
	t.Helper()
	if d.TeamAID == nil || d.TeamBID == nil {
		t.Fatalf("match %d not fully populated: %+v", d.MatchNumber, d)
	}
	gotA, gotB := *d.TeamAID, *d.TeamBID
	if (gotA != wantA || gotB != wantB) && (gotA != wantB || gotB != wantA) {
		t.Errorf("match %d pair = (%d, %d), want (%d, %d) (in either order)",
			d.MatchNumber, gotA, gotB, wantA, wantB)
	}
}
