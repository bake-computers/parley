package backends

import (
	"context"

	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// R6Backend fetches Rainbow Six Siege stats via stats.cc API with scraper fallback.
type R6Backend struct {
	client fetch.Client
}

// NewR6Backend wraps the given stats client.
func NewR6Backend(client fetch.Client) *R6Backend {
	return &R6Backend{client: client}
}

// Game implements StatsBackend.
func (b *R6Backend) Game() Game {
	return GameR6
}

// Fetch implements StatsBackend.
func (b *R6Backend) Fetch(ctx context.Context, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
	return b.client.FetchStats(ctx, username, platform, season)
}

// FetchCollection implements StatsBackend.
func (b *R6Backend) FetchCollection(ctx context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return b.client.FetchStatsCollection(ctx, username, platform)
}
