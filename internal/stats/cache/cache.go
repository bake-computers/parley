package cache

import (
	"context"

	"github.com/bake-computers/parley/internal/stats/fetch"
	"github.com/bake-computers/parley/internal/stats/scrape"
)

// CacheStore is the R6 cache-or-fetch facade.
type CacheStore interface {
	Fetch(ctx context.Context, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error)
	FetchCollection(ctx context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}
