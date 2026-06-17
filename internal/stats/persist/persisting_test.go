package persist

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/cache"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

type mockCacheStore struct {
	fetchFn     func(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (cache.CachedStats, error)
	fetchCollFn func(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

func (m *mockCacheStore) Fetch(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (cache.CachedStats, error) {
	return m.fetchFn(ctx, game, username, platform, season)
}

func (m *mockCacheStore) FetchCollection(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return m.fetchCollFn(ctx, game, username, platform)
}

type mockSnapshotWriter struct {
	mu    sync.Mutex
	calls []scrape.ScrapedStats
	err   error
}

func (m *mockSnapshotWriter) PersistSnapshot(_ context.Context, _ backends.Game, stats *scrape.ScrapedStats) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, *stats)
	return m.err
}

func (m *mockSnapshotWriter) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.calls)
}

func TestPersistingStatsCacheStore_Fetch_EnqueuesOnSuccess(t *testing.T) {
	want := scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "alice"}}
	inner := &mockCacheStore{
		fetchFn: func(_ context.Context, _ backends.Game, _ string, _ fetch.StatsPlatform, _ *string) (cache.CachedStats, error) {
			return cache.CachedStats{Stats: want, Degraded: false}, nil
		},
		fetchCollFn: func(context.Context, backends.Game, string, fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return scrape.ScrapedStatsCollection{}, nil
		},
	}
	writer := &mockSnapshotWriter{}
	persister := NewStatsPersisterWithCapacity(writer, 8)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go persister.Run(ctx)

	store := NewPersistingStatsCacheStore(inner, persister)
	got, err := store.Fetch(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformPC, nil)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if got.Stats.Profile.Username != "alice" {
		t.Fatalf("username = %q", got.Stats.Profile.Username)
	}

	deadline := time.Now().Add(2 * time.Second)
	for writer.count() < 1 {
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for persist")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestPersistingStatsCacheStore_Fetch_SkipsEnqueueOnError(t *testing.T) {
	inner := &mockCacheStore{
		fetchFn: func(context.Context, backends.Game, string, fetch.StatsPlatform, *string) (cache.CachedStats, error) {
			return cache.CachedStats{}, fetch.NewStatsFetchError(fetch.StatsFetchErrorProfileNotFound, "missing", false)
		},
		fetchCollFn: func(context.Context, backends.Game, string, fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return scrape.ScrapedStatsCollection{}, nil
		},
	}
	writer := &mockSnapshotWriter{}
	persister := NewStatsPersister(writer)
	store := NewPersistingStatsCacheStore(inner, persister)
	_, err := store.Fetch(context.Background(), backends.GameR6, "nobody", fetch.StatsPlatformPC, nil)
	if err == nil {
		t.Fatal("expected error")
	}
	if writer.count() != 0 {
		t.Fatalf("persist calls = %d, want 0", writer.count())
	}
}

func TestPersistingStatsCacheStore_FetchCollection_EnqueuesLatest(t *testing.T) {
	latest := scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "bob"}}
	inner := &mockCacheStore{
		fetchFn: func(context.Context, backends.Game, string, fetch.StatsPlatform, *string) (cache.CachedStats, error) {
			return cache.CachedStats{}, nil
		},
		fetchCollFn: func(context.Context, backends.Game, string, fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return scrape.ScrapedStatsCollection{Latest: latest}, nil
		},
	}
	writer := &mockSnapshotWriter{}
	persister := NewStatsPersisterWithCapacity(writer, 4)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go persister.Run(ctx)

	store := NewPersistingStatsCacheStore(inner, persister)
	_, err := store.FetchCollection(context.Background(), backends.GameR6, "bob", fetch.StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchCollection: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for writer.count() < 1 {
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for persist")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestStatsPersister_Enqueue_ChannelFullDoesNotBlock(t *testing.T) {
	const cap = 4
	writer := &mockSnapshotWriter{}
	persister := NewStatsPersisterWithCapacity(writer, cap)

	done := make(chan struct{})
	go func() {
		stats := scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "u"}}
		for range cap + 100 {
			persister.Enqueue(backends.GameR6, stats)
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Enqueue blocked when channel full")
	}
}

func TestStatsPersister_Run_DrainsOnCancel(t *testing.T) {
	writer := &mockSnapshotWriter{}
	persister := NewStatsPersisterWithCapacity(writer, 16)
	ctx, cancel := context.WithCancel(context.Background())
	go persister.Run(ctx)

	stats := scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "drain"}}
	persister.Enqueue(backends.GameR6, stats)
	cancel()

	deadline := time.Now().Add(3 * time.Second)
	for writer.count() < 1 {
		if time.Now().After(deadline) {
			t.Fatal("drain did not process enqueue")
		}
		time.Sleep(5 * time.Millisecond)
	}
}
