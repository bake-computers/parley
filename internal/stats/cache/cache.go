package cache

import (
	"context"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// CachedStats wraps a single-season stats result with a degraded flag.
// Mirrors Rust CachedStats.
type CachedStats struct {
	Stats    scrape.ScrapedStats
	Degraded bool
}

// CacheStore is the game-aware cache-or-fetch facade.
// Mirrors Rust StatsCacheStore trait.
type CacheStore interface {
	Fetch(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (CachedStats, error)
	FetchCollection(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

// OnFetchFunc is called after a successful backend fetch (for leaderboard integration).
type OnFetchFunc func(ctx context.Context, game backends.Game, username string, stats *scrape.ScrapedStats)
