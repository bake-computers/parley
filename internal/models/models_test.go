package models_test

import (
	"database/sql/driver"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/parley-bot/parley/internal/models"
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

func TestLanguageValueScan(t *testing.T) {
	t.Parallel()

	var lang models.Language
	if err := lang.Scan([]byte("de")); err != nil {
		t.Fatalf("scan de: %v", err)
	}
	v, err := lang.Value()
	if err != nil {
		t.Fatalf("value: %v", err)
	}
	if v != driver.Value("de") {
		t.Fatalf("got %#v want de", v)
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
	_ = models.UserSettings{Language: models.LanguageEn}
}
