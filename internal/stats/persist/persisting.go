package persist

import (
	"context"

	"github.com/bake-computers/parley/internal/stats/cache"
	"github.com/bake-computers/parley/internal/stats/fetch"
	"github.com/bake-computers/parley/internal/stats/scrape"
)

// PersistingStatsCacheStore wraps a CacheStore and enqueues snapshot persistence
// after successful fetches.
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
	username string,
	platform fetch.StatsPlatform,
	season *string,
) (scrape.ScrapedStats, error) {
	result, err := s.inner.Fetch(ctx, username, platform, season)
	if err != nil {
		return scrape.ScrapedStats{}, err
	}
	if s.persister != nil {
		s.persister.Enqueue(result)
	}
	return result, nil
}

// FetchCollection delegates to the inner store, then enqueues latest snapshot on success.
func (s *PersistingStatsCacheStore) FetchCollection(
	ctx context.Context,
	username string,
	platform fetch.StatsPlatform,
) (scrape.ScrapedStatsCollection, error) {
	result, err := s.inner.FetchCollection(ctx, username, platform)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, err
	}
	if s.persister != nil {
		s.persister.Enqueue(result.Latest)
	}
	return result, nil
}
