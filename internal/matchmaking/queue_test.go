package matchmaking_test

import (
	"testing"

	"github.com/pactum-computers/parley/internal/matchmaking"
	"github.com/pactum-computers/parley/internal/models"
)

// TestFindMatchingStackIndicesSolo1v1 mirrors the Rust
// finds_two_solo_stacks_for_1v1. Two 1-player stacks for a 2-player
// lobby should produce a 2-element index set.
func TestFindMatchingStackIndicesSolo1v1(t *testing.T) {
	t.Parallel()

	stacks := []models.MatchmakingQueue{
		{
			ID:                  1,
			Game:                models.GameR6,
			GuildID:             "g",
			ChannelID:           "c",
			PlayerCount:         1,
			StackBalanceTotal:   0.5,
			StackBalanceAverage: 0.5,
			TeamSize:            1,
		},
		{
			ID:                  2,
			Game:                models.GameR6,
			GuildID:             "g",
			ChannelID:           "c",
			PlayerCount:         1,
			StackBalanceTotal:   0.5,
			StackBalanceAverage: 0.5,
			TeamSize:            1,
		},
	}
	idx := matchmaking.FindMatchingStackIndices(stacks, 2)
	if idx == nil {
		t.Fatal("expected to find a match, got nil")
	}
	if len(idx) != 2 {
		t.Fatalf("len(indices) = %d, want 2", len(idx))
	}
}

// TestFindMatchingStackIndicesNoMatch returns nil when the stacks
// cannot satisfy the lobby size.
func TestFindMatchingStackIndicesNoMatch(t *testing.T) {
	t.Parallel()

	stacks := []models.MatchmakingQueue{
		{PlayerCount: 1, TeamSize: 5},
		{PlayerCount: 1, TeamSize: 5},
	}
	if idx := matchmaking.FindMatchingStackIndices(stacks, 10); idx != nil {
		t.Fatalf("expected nil, got %v", idx)
	}
}

// TestFindMatchingStackIndicesEmpty returns nil for an empty pool.
func TestFindMatchingStackIndicesEmpty(t *testing.T) {
	t.Parallel()

	if idx := matchmaking.FindMatchingStackIndices(nil, 10); idx != nil {
		t.Fatalf("expected nil for empty pool, got %v", idx)
	}
}
