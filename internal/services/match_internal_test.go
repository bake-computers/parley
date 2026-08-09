package services

import (
	"testing"

	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
)

func TestOpponentMuAveragesMembershipElo(t *testing.T) {
	t.Parallel()

	team := []models.MatchParticipantWithUsername{
		{DiscordUserID: "a"},
		{DiscordUserID: "b"},
		{DiscordUserID: "c"}, // no membership — ignored
	}
	members := map[string]repos.GuildMemberRow{
		"a": {DiscordUserID: "a", InternalElo: 1200},
		"b": {DiscordUserID: "b", InternalElo: 1800},
	}

	got := opponentMu(team, members)
	if got != 1500 {
		t.Fatalf("opponentMu = %v, want 1500", got)
	}
}

func TestOpponentMuEmptyOrMissingFallsBack(t *testing.T) {
	t.Parallel()

	if got := opponentMu(nil, nil); got != 1000 {
		t.Fatalf("empty team = %v, want 1000", got)
	}
	team := []models.MatchParticipantWithUsername{{DiscordUserID: "x"}}
	if got := opponentMu(team, map[string]repos.GuildMemberRow{}); got != 1000 {
		t.Fatalf("no memberships = %v, want 1000", got)
	}
}
