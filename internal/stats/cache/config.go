package cache

import (
	"fmt"
	"strings"
	"time"

	"github.com/pactum-computers/parley/internal/config"
	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
)

// CacheConfig holds per-game TTLs.
type CacheConfig struct {
	TTLR6 time.Duration
}

// NewCacheConfigFromEnv builds CacheConfig from the global Config.
func NewCacheConfigFromEnv(cfg *config.Config) CacheConfig {
	return CacheConfig{
		TTLR6: time.Duration(cfg.StatsTTLR6MS) * time.Millisecond,
	}
}

// TTLFor returns the TTL for a given game.
func (c CacheConfig) TTLFor(game backends.Game) time.Duration {
	switch game {
	case backends.GameR6:
		if c.TTLR6 > 0 {
			return c.TTLR6
		}
		return 60 * time.Second
	default:
		return 60 * time.Second
	}
}

func platformKey(p fetch.StatsPlatform) string {
	switch p {
	case fetch.StatsPlatformPC:
		return "pc"
	case fetch.StatsPlatformXbox:
		return "xbox"
	case fetch.StatsPlatformPlaystation:
		return "psn"
	default:
		return "auto"
	}
}

// FreshKey returns the Redis hash key for a fresh stats entry.
func FreshKey(game backends.Game, username string, platform fetch.StatsPlatform, season *string) string {
	s := ""
	if season != nil {
		s = *season
	}
	return fmt.Sprintf("stats:%s:%s:%s:%s", game, strings.ToLower(strings.TrimSpace(username)), platformKey(platform), s)
}

// CollectionKey returns the Redis hash key for a collection entry.
func CollectionKey(game backends.Game, username string, platform fetch.StatsPlatform) string {
	return fmt.Sprintf("stats:collection:%s:%s:%s", game, strings.ToLower(strings.TrimSpace(username)), platformKey(platform))
}
