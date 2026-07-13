package cache

import (
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"testing"
	"time"
)

func TestCacheConfigTTL(t *testing.T) {
	if got := (CacheConfig{}).TTL(); got != 60*time.Second {
		t.Fatalf("default TTL = %v", got)
	}
	if got := (CacheConfig{TTLR6: 30 * time.Second}).TTL(); got != 30*time.Second {
		t.Fatalf("custom TTL = %v", got)
	}
}

func TestR6CacheKeys(t *testing.T) {
	if got := FreshKey("  Player1  ", fetch.StatsPlatformPC, strPtr("y9s1")); got != "stats:r6:player1:pc:y9s1" {
		t.Fatalf("fresh key = %q", got)
	}
	if got := FreshKey("Player1", fetch.StatsPlatformAuto, nil); got != "stats:r6:player1:auto:" {
		t.Fatalf("fresh auto key = %q", got)
	}
	if got := CollectionKey("player1", fetch.StatsPlatformAuto); got != "stats:collection:r6:player1:auto" {
		t.Fatalf("collection key = %q", got)
	}
}

func strPtr(s string) *string { return &s }
