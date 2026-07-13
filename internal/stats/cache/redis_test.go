package cache

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
	"github.com/redis/go-redis/v9"
)

type fakeStatsClient struct {
	fetchCount atomic.Int32
	stats      scrape.ScrapedStats
	collection scrape.ScrapedStatsCollection
	err        error
}

func (f *fakeStatsClient) FetchStats(context.Context, string, fetch.StatsPlatform, *string) (scrape.ScrapedStats, error) {
	f.fetchCount.Add(1)
	time.Sleep(20 * time.Millisecond)
	return f.stats, f.err
}
func (f *fakeStatsClient) FetchStatsCollection(context.Context, string, fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	f.fetchCount.Add(1)
	return f.collection, f.err
}

func newTestRedis(t *testing.T) (*miniredis.Miniredis, redis.Cmdable) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	return mr, client
}

func sampleStats() scrape.ScrapedStats {
	return scrape.ScrapedStats{
		Profile:           scrape.StatsProfile{Username: "alice", Level: 100},
		RankedStats:       scrape.RankedStats{Season: "y9s1", RankPoints: 3200, WinRate: 0.55},
		CalculatedMetrics: scrape.CalculatedMetrics{KOST: 0.72},
	}
}

func TestRedisCacheStoreFetchHit(t *testing.T) {
	mr, client := newTestRedis(t)
	stats := sampleStats()
	key := FreshKey("alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	p, _ := json.Marshal(stats.Profile)
	r, _ := json.Marshal(stats.RankedStats)
	m, _ := json.Marshal(stats.CalculatedMetrics)
	mr.HSet(key, "p", string(p), "r", string(r), "m", string(m))
	mr.SetTTL(key, time.Minute)
	fake := &fakeStatsClient{stats: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "wrong"}}}
	store := NewRedisCacheStore(client, fake, CacheConfig{TTLR6: time.Minute})

	got, err := store.Fetch(context.Background(), "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	if err != nil || got.Profile.Username != "alice" {
		t.Fatalf("got stats=%+v err=%v", got, err)
	}
	if fake.fetchCount.Load() != 0 {
		t.Fatal("cache hit called stats client")
	}
}

func TestRedisCacheStoreFetchMissCachesAndDeduplicates(t *testing.T) {
	mr, client := newTestRedis(t)
	fake := &fakeStatsClient{stats: sampleStats()}
	store := NewRedisCacheStore(client, fake, CacheConfig{TTLR6: time.Minute})
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = store.Fetch(context.Background(), "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
		}()
	}
	wg.Wait()
	if fake.fetchCount.Load() != 1 {
		t.Fatalf("stats client calls = %d, want 1", fake.fetchCount.Load())
	}
	if !mr.Exists(FreshKey("alice", fetch.StatsPlatformPC, strPtr("y9s1"))) {
		t.Fatal("fresh key missing after fetch")
	}
}

func TestRedisCacheStoreFetchPropagatesError(t *testing.T) {
	_, client := newTestRedis(t)
	fake := &fakeStatsClient{err: fetch.NewStatsFetchError(fetch.StatsFetchErrorProfileNotFound, "not found", false)}
	store := NewRedisCacheStore(client, fake, CacheConfig{})
	_, err := store.Fetch(context.Background(), "nobody", fetch.StatsPlatformPC, nil)
	if err == nil || err.(*fetch.StatsFetchError).Kind != fetch.StatsFetchErrorProfileNotFound {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRedisCacheStoreCollection(t *testing.T) {
	_, client := newTestRedis(t)
	coll := scrape.ScrapedStatsCollection{Latest: sampleStats(), BySeason: map[string]scrape.ScrapedStats{"y9s1": sampleStats()}}
	fake := &fakeStatsClient{collection: coll}
	store := NewRedisCacheStore(client, fake, CacheConfig{TTLR6: time.Minute})
	got, err := store.FetchCollection(context.Background(), "alice", fetch.StatsPlatformAuto)
	if err != nil || got.Latest.Profile.Username != "alice" {
		t.Fatalf("got collection=%+v err=%v", got, err)
	}
	if fake.fetchCount.Load() != 1 {
		t.Fatalf("stats client calls = %d, want 1", fake.fetchCount.Load())
	}
}
