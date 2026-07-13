package cache

import (
	"context"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// CacheStore is the game-aware cache-or-fetch facade.
type CacheStore interface {
	Fetch(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error)
	FetchCollection(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

// OnFetchFunc is called after a successful backend fetch (for leaderboard integration).
type OnFetchFunc func(ctx context.Context, game backends.Game, username string, stats *scrape.ScrapedStats)
