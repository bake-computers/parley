package tourney

// Bracket identifiers used by BracketDraft.Bracket.
const (
	BracketWinners    = "winners"
	BracketLosers     = "losers"
	BracketGrandFinal = "grand_final"
)

// Slot identifiers used by WinnerToSlot / LoserToSlot.
const (
	SlotA = "a"
	SlotB = "b"
)

// BracketKey identifies a (bracket, round, match) slot in the topology.
// It is used as the pre-persistence pointer between drafts; once persisted,
// callers resolve the key to a concrete bracket_matches row id.
type BracketKey struct {
	Bracket     string
	RoundNumber int32
	MatchNumber int32
}

// BracketDraft is a pending bracket match before persistence. Team IDs are
// pointers so that nil cleanly represents a bye or an unfilled slot. Mirrors
// BracketDraft in src/tourney/bracket.rs.
type BracketDraft struct {
	Bracket      string
	RoundNumber  int32
	MatchNumber  int32
	TeamAID      *int32
	TeamBID      *int32
	WinnerToKey  *BracketKey
	WinnerToSlot *string
	LoserToKey   *BracketKey
	LoserToSlot  *string
}

// nextPowerOfTwo returns the smallest power of two >= n, with a floor of 2.
// Mirrors next_power_of_two in src/tourney/bracket.rs.
func nextPowerOfTwo(n int) int {
	if n <= 1 {
		return 2
	}
	size := 1
	for size < n {
		size <<= 1
	}
	return size
}

// bracketRoundCount returns the number of rounds for a bracket of the given
// size. A size-2 bracket is 1 round; size-4 is 2; size-8 is 3; etc.
func bracketRoundCount(bracketSize int) int {
	rounds := 0
	for s := bracketSize; s > 1; s >>= 1 {
		rounds++
	}
	return rounds
}

// slotFor returns "a" for even m, "b" for odd m — the destination slot in
// the next round's match for the winner/loser of match m.
func slotFor(m int) string {
	if m%2 == 0 {
		return SlotA
	}
	return SlotB
}

// GenerateSingleElimination builds the winners bracket for a single-elimination
// tournament from a list of team IDs in seed order (best first).
//
// If len(teamIDs) is not a power of two, the bracket is rounded up to the next
// power of two and the unfilled slots become byes (nil team IDs in the
// returned drafts). The result includes both leaf matches (round 1) and
// upper-round placeholder matches whose team IDs are nil until the prior
// round resolves.
//
// Returns nil when fewer than 2 teams are provided.
func GenerateSingleElimination(teamIDs []int32) []BracketDraft {
	n := len(teamIDs)
	if n < 2 {
		return nil
	}
	bracketSize := nextPowerOfTwo(n)
	rounds := bracketRoundCount(bracketSize)

	order := StandardBracketOrder(bracketSize)
	for len(order) < bracketSize {
		order = append(order, -1)
	}

	// Place each team at its bracket slot per the standard seeding order.
	seeded := make([]*int32, bracketSize)
	for i := range teamIDs {
		if i >= bracketSize {
			break
		}
		slot := order[i]
		if slot < 0 {
			continue
		}
		seeded[slot] = &teamIDs[i]
	}

	drafts := make([]BracketDraft, 0, bracketSize-1)

	// Round 1: pair adjacent slots.
	r1Count := bracketSize / 2
	for m := 0; m < r1Count; m++ {
		draft := BracketDraft{
			Bracket:     BracketWinners,
			RoundNumber: 1,
			MatchNumber: int32(m + 1),
			TeamAID:     seeded[m*2],
			TeamBID:     seeded[m*2+1],
		}
		if rounds > 1 {
			draft.WinnerToKey = &BracketKey{
				Bracket:     BracketWinners,
				RoundNumber: 2,
				MatchNumber: int32(m/2 + 1),
			}
			slot := slotFor(m)
			draft.WinnerToSlot = &slot
		}
		drafts = append(drafts, draft)
	}

	// Upper rounds: placeholders. Round `rounds` has no winner_to (final).
	matchesInRound := r1Count / 2
	for round := 2; round <= rounds; round++ {
		for m := 0; m < matchesInRound; m++ {
			draft := BracketDraft{
				Bracket:     BracketWinners,
				RoundNumber: int32(round),
				MatchNumber: int32(m + 1),
			}
			if round < rounds {
				draft.WinnerToKey = &BracketKey{
					Bracket:     BracketWinners,
					RoundNumber: int32(round + 1),
					MatchNumber: int32(m/2 + 1),
				}
				slot := slotFor(m)
				draft.WinnerToSlot = &slot
			}
			drafts = append(drafts, draft)
		}
		matchesInRound /= 2
	}

	return drafts
}

// GenerateDoubleElimination extends a single-elimination bracket with a losers
// bracket and a grand final.
//
// The losers bracket is sketched at the topology level: it wires the losers
// of winners round 1 into losers round 1, the losers bracket final into
// grand final slot "b", and the losers of the winners final into losers
// round 2 slot "a". Loser brackets beyond round 2 are intentionally not
// expanded — the persistence layer fills in additional rounds as the
// tournament progresses, mirroring generate_double_elimination in
// src/tourney/bracket.rs.
//
// Returns nil when fewer than 2 teams are provided.
func GenerateDoubleElimination(teamIDs []int32) []BracketDraft {
	drafts := GenerateSingleElimination(teamIDs)
	if len(teamIDs) < 2 {
		return drafts
	}
	bracketSize := nextPowerOfTwo(len(teamIDs))

	// Losers round 1: bracketSize/4 matches, floored at 1 to keep the
	// losers bracket at least a single feed even for tiny fields.
	losersR1 := bracketSize / 4
	if losersR1 < 1 {
		losersR1 = 1
	}
	losersR2Slot := SlotA
	losersR2Key := &BracketKey{Bracket: BracketLosers, RoundNumber: 2, MatchNumber: 1}
	for m := 0; m < losersR1; m++ {
		slot := SlotA
		if m != 0 {
			slot = SlotB
		}
		drafts = append(drafts, BracketDraft{
			Bracket:      BracketLosers,
			RoundNumber:  1,
			MatchNumber:  int32(m + 1),
			WinnerToKey:  losersR2Key,
			WinnerToSlot: &slot,
		})
	}
	_ = losersR2Slot

	// Losers round 2: a single feeder that progresses to grand final slot b.
	grandFinalSlot := SlotB
	drafts = append(drafts, BracketDraft{
		Bracket:      BracketLosers,
		RoundNumber:  2,
		MatchNumber:  1,
		WinnerToKey:  &BracketKey{Bracket: BracketGrandFinal, RoundNumber: 1, MatchNumber: 1},
		WinnerToSlot: &grandFinalSlot,
	})

	// Wire the losers of the winners bracket final into losers round 2 slot a.
	lastIdx := indexOfWinnersFinal(drafts)
	if lastIdx >= 0 {
		drafts[lastIdx].LoserToKey = &BracketKey{Bracket: BracketLosers, RoundNumber: 2, MatchNumber: 1}
		slot := SlotA
		drafts[lastIdx].LoserToSlot = &slot
	}

	// Wire winners round 1 losers into losers round 1.
	for m := 0; m < bracketSize/2; m++ {
		target := int32(m + 1)
		for i := range drafts {
			if drafts[i].Bracket == BracketWinners &&
				drafts[i].RoundNumber == 1 &&
				drafts[i].MatchNumber == target {
				loserMatch := int32(m/2 + 1)
				drafts[i].LoserToKey = &BracketKey{
					Bracket:     BracketLosers,
					RoundNumber: 1,
					MatchNumber: loserMatch,
				}
				slot := slotFor(m)
				drafts[i].LoserToSlot = &slot
				break
			}
		}
	}

	// Grand final placeholder.
	drafts = append(drafts, BracketDraft{
		Bracket:     BracketGrandFinal,
		RoundNumber: 1,
		MatchNumber: 1,
	})

	return drafts
}

// indexOfWinnersFinal returns the index of the winners bracket match with
// the highest (round, match_number) — i.e. the winners final. Returns -1 if
// no winners bracket match exists.
func indexOfWinnersFinal(drafts []BracketDraft) int {
	best := -1
	for i, d := range drafts {
		if d.Bracket != BracketWinners {
			continue
		}
		if best == -1 {
			best = i
			continue
		}
		cur := drafts[best]
		if d.RoundNumber > cur.RoundNumber ||
			(d.RoundNumber == cur.RoundNumber && d.MatchNumber > cur.MatchNumber) {
			best = i
		}
	}
	return best
}

// DraftsByRound groups bracket drafts by their (bracket, round) for
// inspection and rendering. The returned slice is sorted ascending by round.
func DraftsByRound(bracket string, drafts []BracketDraft) map[int32][]BracketDraft {
	out := make(map[int32][]BracketDraft)
	for _, d := range drafts {
		if d.Bracket != bracket {
			continue
		}
		out[d.RoundNumber] = append(out[d.RoundNumber], d)
	}
	return out
}

// IsBye reports whether the given draft represents a bye — i.e. exactly one
// of its two team slots is filled. Such a match should auto-advance the
// non-nil team to the winner_to slot.
func IsBye(d BracketDraft) bool {
	return (d.TeamAID == nil) != (d.TeamBID == nil)
}

// Ready reports whether both team slots in a draft are filled (i.e. the match
// is ready to be played and reported).
func Ready(d BracketDraft) bool {
	return d.TeamAID != nil && d.TeamBID != nil
}
