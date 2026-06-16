//go:build integration
// +build integration

// Tournament integration tests — create and list round-trip.
//
// Ported from tests/tournament.rs. The Rust suite tested
// tournament_create_and_list: creates a tournament via TournamentRepo,
// then lists for the guild and asserts exactly 1 row is returned with
// the same ID.
//
// The Go port exercises TournamentRepo.Create and
// TournamentRepo.ListForGuild against a testcontainers Postgres via
// bun, keeping the test faithful to the Rust original.
package tests

import (
	"context"
	"fmt"
	"testing"

	"github.com/parley-bot/parley/internal/models"
	"github.com/parley-bot/parley/internal/repos"
)

// TestTournament_CreateAndList mirrors the Rust
// tournament_create_and_list test. It creates a tournament row via the
// repo, then lists tournaments for the guild and asserts the returned
// slice contains exactly the one just created.
func TestTournament_CreateAndList(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()
	tournRepo := repos.NewTournamentRepo(bdb)

	guildID := fmt.Sprintf("t_guild_%s", randomSuffix())
	now := repos.NowMS()

	created, err := tournRepo.Create(ctx, &models.NewTournament{
		Game:                   models.GameR6,
		Name:                   "Friday Cup",
		NameNormalized:         "friday cup",
		Format:                 "5v5 single_elimination",
		TeamCap:                4,
		Visibility:             "public",
		Status:                 "open",
		CreatedByGuildID:       guildID,
		CreatedByChannelID:     "chan",
		CreatedByDiscordUserID: "creator",
		CreatedAt:              now,
		UpdatedAt:              now,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID == 0 {
		t.Fatal("Create: returned ID = 0, want non-zero")
	}

	listed, err := tournRepo.ListForGuild(ctx, models.GameR6, guildID, nil, 10)
	if err != nil {
		t.Fatalf("ListForGuild: %v", err)
	}
	if got := len(listed); got != 1 {
		t.Fatalf("listed len = %d, want 1", got)
	}
	if listed[0].ID != created.ID {
		t.Errorf("listed[0].ID = %d, want %d", listed[0].ID, created.ID)
	}
	if listed[0].Name != "Friday Cup" {
		t.Errorf("listed[0].Name = %q, want %q", listed[0].Name, "Friday Cup")
	}
}
