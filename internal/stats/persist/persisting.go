package persist

import (
	"context"

	"github.com/parley-bot/parley/internal/stats/backends"
	"github.com/parley-bot/parley/internal/stats/cache"
	"github.com/parley-bot/parley/internal/stats/fetch"
	"github.com/parley-bot/parley/internal/stats/scrape"
)

// PersistingStatsCacheStore wraps a CacheStore and enqueues snapshot persistence
// after successful fetches. Mirrors src/stats_persist.rs PersistingStatsCacheStore.
type PersistingStatsCacheStore struct {
	inner     cache.CacheStore
	persister *StatsPersister
}

// NewPersistingStatsCacheStore decorates inner with optional async persistence.
func NewPersistingStatsCacheStore(inner cache.CacheStore, persister *StatsPersister) *PersistingStatsCacheStore {
	return &PersistingStatsCacheStore{inner: inner, persister: persister}
}

// Fetch delegates to the inner store, then enqueues a snapshot on success.
func (s *PersistingStatsCacheStore) Fetch(
	ctx context.Context,
	game backends.Game,
	username string,
	platform fetch.StatsPlatform,
	season *string,
) (cache.CachedStats, error) {
	result, err := s.inner.Fetch(ctx, game, username, platform, season)
	if err != nil {
		return cache.CachedStats{}, err
	}
	if s.persister != nil {
		s.persister.Enqueue(game, result.Stats)
	}
	return result, nil
}

// FetchCollection delegates to the inner store, then enqueues latest snapshot on success.
func (s *PersistingStatsCacheStore) FetchCollection(
	ctx context.Context,
	game backends.Game,
	username string,
	platform fetch.StatsPlatform,
) (scrape.ScrapedStatsCollection, error) {
	result, err := s.inner.FetchCollection(ctx, game, username, platform)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, err
	}
	if s.persister != nil {
		s.persister.Enqueue(game, result.Latest)
	}
	return result, nil
}
