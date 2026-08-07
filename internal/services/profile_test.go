package services

import (
	"testing"

	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
	"github.com/google/uuid"
)

func TestUniqueStrings(t *testing.T) {
	got := uniqueStrings([]string{"a", "", "b", "a", "c"})
	want := []string{"a", "b", "c"}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestProfileMatchToProtoWinLoss(t *testing.T) {
	winning := "a"
	row := &models.MatchRow{
		PublicUUID:  uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		CreatedAt:   1_700_000_000_000,
		WinningTeam: &winning,
		Status:      "completed",
	}
	kills := int32(5)
	delta := 12.5
	parts := []models.MatchParticipantWithUsername{
		{
			DiscordUserID: "viewer",
			Team:          "a",
			Kills:         &kills,
			RatingDelta:   &delta,
			Username:      strPtr("ViewerR6"),
			Platform:      strPtr("pc"),
		},
		{
			DiscordUserID: "opp",
			Team:          "b",
			Username:      strPtr("OppR6"),
			Platform:      strPtr("pc"),
		},
	}
	discordProfiles := map[string]models.DiscordProfile{
		"opp": {DiscordUserID: "opp", Username: "avqny"},
	}
	privacy := map[string]bool{"opp": true, "viewer": true}

	pm := profileMatchToProto("viewer", row, parts, discordProfiles, privacy)
	if pm == nil {
		t.Fatal("expected match")
	}
	if pm.Result != "win" {
		t.Fatalf("result = %q, want win", pm.Result)
	}
	if len(pm.Opponents) != 1 {
		t.Fatalf("opponents = %d, want 1", len(pm.Opponents))
	}
	if pm.Opponents[0].DiscordUsername != "avqny" {
		t.Fatalf("opponent discord = %q", pm.Opponents[0].DiscordUsername)
	}
	if pm.Opponents[0].GameUsername != "OppR6" {
		t.Fatalf("opponent game = %q", pm.Opponents[0].GameUsername)
	}
	if pm.RatingDelta == nil || *pm.RatingDelta != delta {
		t.Fatalf("rating delta = %v", pm.RatingDelta)
	}
}

func TestNormalizeDiscordUsernameInRepos(t *testing.T) {
	if got := repos.NormalizeDiscordUsername("@Ryzm"); got != "ryzm" {
		t.Fatalf("got %q", got)
	}
}

func TestIsParkedDiscordUsernameBlocksPublic(t *testing.T) {
	if !repos.IsParkedDiscordUsername("parked_99") {
		t.Fatal("expected parked")
	}
}

func strPtr(s string) *string { return &s }
