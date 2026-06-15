package matchmaking

import (
	"math"
	"strconv"
	"strings"
)

// TeamRoster is a team's Glicko-2 rating vector used to compute win
// probability between two teams. Mirrors TeamRoster in
// src/matchmaking/mod.rs.
type TeamRoster struct {
	Members []RosterMember
}

// RosterMember is a single (mu, phi) rating pair.
type RosterMember struct {
	Mu  float64
	Phi float64
}

// avgMu returns the team's mean mu, or 1500.0 (Glicko-2 default) when
// the roster is empty. Mirrors TeamRoster::avg_mu in src/matchmaking/mod.rs.
func (r TeamRoster) avgMu() float64 {
	if len(r.Members) == 0 {
		return 1500.0
	}
	var sum float64
	for _, m := range r.Members {
		sum += m.Mu
	}
	return sum / float64(len(r.Members))
}

// TeamWinProbability returns the Glicko-2 win probability for team_a
// against team_b, accounting for each player's RD. Returns 0.5 when
// the denominator collapses to zero. Mirrors team_win_probability in
// src/matchmaking/mod.rs.
func TeamWinProbability(teamA, teamB TeamRoster) float64 {
	muA := teamA.avgMu()
	muB := teamB.avgMu()

	var sumPhiSq float64
	for _, m := range teamA.Members {
		sumPhiSq += m.Phi * m.Phi
	}
	for _, m := range teamB.Members {
		sumPhiSq += m.Phi * m.Phi
	}

	denom := math.Sqrt(2.0*beta*beta + sumPhiSq)
	if denom == 0 {
		return 0.5
	}
	exponent := -(muA - muB) / denom
	return 1.0 / (1.0 + math.Pow(10, exponent))
}

// RatedPlayer is a player pre-bundled with the Glicko-2 rating and CPR
// values used by PartitionTeams. Mirrors RatedPlayer in
// src/matchmaking/mod.rs.
type RatedPlayer struct {
	Mu  float64
	Phi float64
	CPR float64
}

// TeamPartition is the result of PartitionTeams. TeamA and TeamB are
// indices into the input player slice. WinProbability and BalanceGap
// describe the fairness of the split. Mirrors TeamPartition in
// src/matchmaking/mod.rs.
type TeamPartition struct {
	TeamA          []int
	TeamB          []int
	WinProbability float64
	BalanceGap     float64
}

// PartitionTeams splits players into two equal teams of teamSize,
// returning the partition that minimizes |win_probability - 0.5| and,
// ties, the smallest |cpr_sum_a - cpr_sum_b|. Returns nil when the
// player count is not exactly 2*teamSize or is zero. Mirrors
// partition_teams in src/matchmaking/mod.rs.
func PartitionTeams(players []RatedPlayer, teamSize int) *TeamPartition {
	n := len(players)
	if n != teamSize*2 || n == 0 {
		return nil
	}

	var best *TeamPartition
	for _, combo := range combinationsIncludingFirst(n, teamSize) {
		inA := make(map[int]struct{}, len(combo))
		for _, i := range combo {
			inA[i] = struct{}{}
		}
		teamA := make([]int, len(combo))
		copy(teamA, combo)
		var teamB []int
		for i := 0; i < n; i++ {
			if _, ok := inA[i]; !ok {
				teamB = append(teamB, i)
			}
		}

		// Canonical ordering: avoid mirror duplicates by ensuring
		// teamB's smallest index is >= teamA's smallest index.
		if teamB[0] < teamA[0] {
			teamA, teamB = teamB, teamA
		}

		rosterA := buildRoster(players, teamA)
		rosterB := buildRoster(players, teamB)
		winProb := TeamWinProbability(rosterA, rosterB)

		var cprA, cprB float64
		for _, i := range teamA {
			cprA += players[i].CPR
		}
		for _, i := range teamB {
			cprB += players[i].CPR
		}
		balanceGap := math.Abs(cprA - cprB)

		fairness := math.Abs(winProb - 0.5)
		replace := false
		switch best {
		case nil:
			replace = true
		default:
			bestFair := math.Abs(best.WinProbability - 0.5)
			if fairness < bestFair-math.SmallestNonzeroFloat64 {
				replace = true
			} else if math.Abs(fairness-bestFair) <= math.SmallestNonzeroFloat64 && balanceGap < best.BalanceGap {
				replace = true
			}
		}

		if replace {
			best = &TeamPartition{
				TeamA:          teamA,
				TeamB:          teamB,
				WinProbability: winProb,
				BalanceGap:     balanceGap,
			}
		}
	}
	return best
}

// buildRoster collects (mu, phi) pairs from players at the given indices.
// Mirrors build_roster in src/matchmaking/mod.rs.
func buildRoster(players []RatedPlayer, indices []int) TeamRoster {
	members := make([]RosterMember, len(indices))
	for i, idx := range indices {
		members[i] = RosterMember{Mu: players[idx].Mu, Phi: players[idx].Phi}
	}
	return TeamRoster{Members: members}
}

// combinationsIncludingFirst returns every k-subset of [0, n) that
// includes index 0. The "first" anchor halves the search space — its
// mirror under the partition canonization is already covered.
// Mirrors combinations_including_first in src/matchmaking/mod.rs.
func combinationsIncludingFirst(n, k int) [][]int {
	if k == 0 || n == 0 {
		return nil
	}
	var out [][]int
	combo := []int{0}
	extendCombo(combo, 1, n, k, &out)
	return out
}

func extendCombo(current []int, start, n, k int, out *[][]int) {
	if len(current) == k {
		cp := make([]int, len(current))
		copy(cp, current)
		*out = append(*out, cp)
		return
	}
	remaining := k - len(current)
	for i := start; i <= n-remaining; i++ {
		current = append(current, i)
		extendCombo(current, i+1, n, k, out)
		current = current[:len(current)-1]
	}
}

// DefaultTeamSize is returned by ParseTeamSize when the format string is
// nil or unparseable. Mirrors parse_team_size's fallback in
// src/matchmaking/mod.rs.
const DefaultTeamSize = 5

// ParseTeamSize extracts the team size from a "XvX" format string.
// Examples: "5v5" -> 5, "3v3" -> 3. Returns DefaultTeamSize when
// format is nil, empty, or doesn't begin with a positive integer.
// Mirrors parse_team_size in src/matchmaking/mod.rs.
func ParseTeamSize(format *string) int {
	if format == nil {
		return DefaultTeamSize
	}
	trimmed := strings.ToLower(strings.TrimSpace(*format))
	head, _, _ := strings.Cut(trimmed, "v")
	if head == "" {
		return DefaultTeamSize
	}
	n, err := strconv.Atoi(head)
	if err != nil || n <= 0 {
		return DefaultTeamSize
	}
	return n
}
