package models_test

import (
	"database/sql/driver"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/bake-computers/parley/internal/models"
)

func TestGameValueScan(t *testing.T) {
	t.Parallel()

	var g models.Game
	if err := g.Scan("r6"); err != nil {
		t.Fatalf("scan r6: %v", err)
	}
	v, err := g.Value()
	if err != nil {
		t.Fatalf("value: %v", err)
	}
	if v != driver.Value("r6") {
		t.Fatalf("got %#v want r6", v)
	}
}

func TestStructTypesCompile(t *testing.T) {
	t.Parallel()

	_ = models.Player{Game: models.GameR6}
	_ = models.NewPlayer{Game: models.GameR6}
	_ = models.PlayerStatSnapshot{Metadata: json.RawMessage(`{"k":1}`)}
	_ = models.GuildMatchmakingRules{Platforms: []string{"pc"}}
	_ = models.MatchRow{PublicUUID: uuid.New()}
	_ = models.MatchParticipantWithUsername{Username: nil}
	_ = models.UserSettings{DiscordUserID: "u1"}
}
