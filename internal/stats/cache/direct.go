package cache

import (
	"context"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// DirectCacheStore is a passthrough that always calls the backend registry.
// Used when REDIS_URL is not configured. Mirrors Rust DirectStatsCacheStore.
type DirectCacheStore struct {
	registry *backends.StatsBackendRegistry
}

// NewDirectCacheStore wraps a backend registry.
func NewDirectCacheStore(registry *backends.StatsBackendRegistry) *DirectCacheStore {
	return &DirectCacheStore{registry: registry}
}

// Fetch delegates to the backend registry. Degraded is always false.
func (d *DirectCacheStore) Fetch(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (CachedStats, error) {
	stats, err := d.registry.Fetch(ctx, game, username, platform, season)
	if err != nil {
		return CachedStats{}, err
	}
	return CachedStats{Stats: stats, Degraded: false}, nil
}

// FetchCollection delegates to the backend registry.
func (d *DirectCacheStore) FetchCollection(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return d.registry.FetchCollection(ctx, game, username, platform)
}
