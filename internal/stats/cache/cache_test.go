package cache

import (
	"testing"
	"time"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
)

func TestCacheConfig_DefaultTTL(t *testing.T) {
	cfg := CacheConfig{}
	if got := cfg.TTLFor(backends.GameR6); got != 60*time.Second {
		t.Errorf("default TTLFor(R6) = %v, want 60s", got)
	}
}

func TestCacheConfig_CustomTTL(t *testing.T) {
	cfg := CacheConfig{TTLR6: 30 * time.Second}
	if got := cfg.TTLFor(backends.GameR6); got != 30*time.Second {
		t.Errorf("TTLFor(R6) = %v, want 30s", got)
	}
}

func TestFreshKey(t *testing.T) {
	tests := []struct {
		game     backends.Game
		username string
		platform fetch.StatsPlatform
		season   *string
		want     string
	}{
		{backends.GameR6, "Player1", fetch.StatsPlatformPC, strPtr("y9s1"), "stats:r6:player1:pc:y9s1"},
		{backends.GameR6, "Player1", fetch.StatsPlatformAuto, nil, "stats:r6:player1:auto:"},
		{backends.GameR6, "  Spaced  ", fetch.StatsPlatformXbox, strPtr("y9s2"), "stats:r6:spaced:xbox:y9s2"},
	}
	for _, tt := range tests {
		got := FreshKey(tt.game, tt.username, tt.platform, tt.season)
		if got != tt.want {
			t.Errorf("FreshKey(%v, %q, %v, %v) = %q, want %q", tt.game, tt.username, tt.platform, tt.season, got, tt.want)
		}
	}
}

func TestCollectionKey(t *testing.T) {
	got := CollectionKey(backends.GameR6, "player1", fetch.StatsPlatformAuto)
	want := "stats:collection:r6:player1:auto"
	if got != want {
		t.Errorf("CollectionKey() = %q, want %q", got, want)
	}
}

func strPtr(s string) *string { return &s }
