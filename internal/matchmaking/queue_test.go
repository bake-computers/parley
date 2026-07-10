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

func TestQueueRegionsCompatible(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		target int32
		stack  int32
		want   bool
	}{
		{name: "global only matches global target", target: 0, stack: 0, want: true},
		{name: "global target excludes eu", target: 0, stack: 1, want: false},
		{name: "eu includes global", target: 1, stack: 0, want: true},
		{name: "eu includes eu", target: 1, stack: 1, want: true},
		{name: "eu excludes na", target: 1, stack: 2, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := matchmaking.QueueRegionsCompatible(tt.target, tt.stack); got != tt.want {
				t.Fatalf("QueueRegionsCompatible(%d, %d) = %v, want %v", tt.target, tt.stack, got, tt.want)
			}
		})
	}
}
