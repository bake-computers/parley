package tourney

import "sort"

// Seeder ranks a team by skill. Higher value = higher seed (better team).
// Callers (e.g. models.TournamentTeam) implement this via StackBalanceAverage.
type Seeder interface {
	SeedScore() float64
}

// SeedTeams sorts teams in-place by descending skill (best first). After
// calling, the team at index 0 is seed #1, index 1 is seed #2, and so on.
// Mirrors seed_teams in src/tourney/seeding.rs.
func SeedTeams[T Seeder](teams []T) {
	sort.SliceStable(teams, func(i, j int) bool {
		return teams[i].SeedScore() > teams[j].SeedScore()
	})
}

// StandardBracketOrder returns the seed positions for a bracket of size n.
//
// The result contains n indices in the order teams should be placed into
// bracket slots: position [0] is the slot for seed #1, position [1] is the
// slot for seed #n, position [2] is the slot for seed #(n/2+1), and so on.
// This is the same binary-folding layout used in src/tourney/seeding.rs.
//
// Examples (n → result):
//   - 1 → [0]
//   - 2 → [0, 1]
//   - 4 → [0, 3, 1, 2]
//   - 8 → [0, 7, 3, 4, 1, 6, 2, 5]
//
// n <= 0 returns nil.
func StandardBracketOrder(n int) []int {
	if n <= 0 {
		return nil
	}
	if n == 1 {
		return []int{0}
	}
	seeds := []int{0}
	size := 1
	for size < n {
		next := make([]int, 0, size*2)
		for _, s := range seeds {
			next = append(next, s)
			next = append(next, size*2-1-s)
		}
		seeds = next
		size *= 2
	}
	return seeds[:n]
}
