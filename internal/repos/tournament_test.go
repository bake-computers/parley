package repos_test

import (
	"testing"

	"github.com/pactum-computers/parley/internal/repos"
)

func TestNormalizeTeamNameMatchesUsername(t *testing.T) {
	const raw = "  Team Alpha  "
	if got := repos.NormalizeTeamName(raw); got != "team alpha" {
		t.Fatalf("NormalizeTeamName(%q) = %q, want team alpha", raw, got)
	}
	if got := repos.NormalizeUsername(raw); got != repos.NormalizeTeamName(raw) {
		t.Fatalf("NormalizeUsername and NormalizeTeamName diverged")
	}
}

func TestTournamentStatusConstants(t *testing.T) {
	if repos.TournamentStatusOpen != "open" {
		t.Fatalf("TournamentStatusOpen = %q", repos.TournamentStatusOpen)
	}
	if repos.BracketStatusReady != "ready" {
		t.Fatalf("BracketStatusReady = %q", repos.BracketStatusReady)
	}
}
