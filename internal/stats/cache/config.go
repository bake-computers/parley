package cache

import (
	"fmt"
	"strings"
	"time"

	"github.com/bake-computers/parley/internal/config"
	"github.com/bake-computers/parley/internal/stats/fetch"
)

// CacheConfig holds the R6 stats TTL.
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
func (c CacheConfig) TTL() time.Duration {
	if c.TTLR6 > 0 {
		return c.TTLR6
	}
	return 60 * time.Second
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

// FreshKey returns the cache key identifying a fresh stats entry for a
// username/platform/season triple.
func FreshKey(username string, platform fetch.StatsPlatform, season *string) string {
	s := ""
	if season != nil {
		s = *season
	}
	return fmt.Sprintf("stats:r6:%s:%s:%s", strings.ToLower(strings.TrimSpace(username)), platformKey(platform), s)
}
