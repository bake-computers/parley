package cache

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/redis/go-redis/v9"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

const (
	hProfile  = "p"
	hRanked   = "r"
	hMetrics  = "m"
	hLatest   = "latest"
	hBySeason = "by_season"
	hCatalog  = "catalog"
)

// RedisCacheStore implements CacheStore with Redis hash-backed caching and
// singleflight deduplication.
type RedisCacheStore struct {
	client   redis.Cmdable
	registry *backends.StatsBackendRegistry
	cfg      CacheConfig
	flight   *SingleFlight[string, fetchResult]
	onFetch  OnFetchFunc
}

type fetchResult struct {
	stats scrape.ScrapedStats
	err   error
}

// NewRedisCacheStore creates a Redis-backed cache store.
// onFetch may be nil; when set, it is called on every successful backend
// fetch (wire it to leaderboard.Touch at construction time).
func NewRedisCacheStore(
	client redis.Cmdable,
	registry *backends.StatsBackendRegistry,
	cfg CacheConfig,
	onFetch OnFetchFunc,
) *RedisCacheStore {
	return &RedisCacheStore{
		client:   client,
		registry: registry,
		cfg:      cfg,
		flight:   NewSingleFlight[string, fetchResult](),
		onFetch:  onFetch,
	}
}

func statsFromHash(fields map[string]string) *scrape.ScrapedStats {
	pRaw, ok := fields[hProfile]
	if !ok {
		return nil
	}
	rRaw, ok := fields[hRanked]
	if !ok {
		return nil
	}
	mRaw, ok := fields[hMetrics]
	if !ok {
		return nil
	}

	var profile scrape.StatsProfile
	var ranked scrape.RankedStats
	var metrics scrape.CalculatedMetrics
	if json.Unmarshal([]byte(pRaw), &profile) != nil ||
		json.Unmarshal([]byte(rRaw), &ranked) != nil ||
		json.Unmarshal([]byte(mRaw), &metrics) != nil {
		return nil
	}
	return &scrape.ScrapedStats{
		Profile:           profile,
		RankedStats:       ranked,
		CalculatedMetrics: metrics,
	}
}

func collectionFromHash(fields map[string]string) *scrape.ScrapedStatsCollection {
	latestRaw, ok := fields[hLatest]
	if !ok {
		return nil
	}
	bySeasonRaw, ok := fields[hBySeason]
	if !ok {
		return nil
	}
	catalogRaw, ok := fields[hCatalog]
	if !ok {
		return nil
	}

	var latest scrape.ScrapedStats
	var bySeason map[string]scrape.ScrapedStats
	var catalog []scrape.SeasonCatalogEntry
	if json.Unmarshal([]byte(latestRaw), &latest) != nil ||
		json.Unmarshal([]byte(bySeasonRaw), &bySeason) != nil ||
		json.Unmarshal([]byte(catalogRaw), &catalog) != nil {
		return nil
	}
	return &scrape.ScrapedStatsCollection{
		Latest:        latest,
		BySeason:      bySeason,
		SeasonCatalog: catalog,
	}
}

// Fetch looks up the fresh key in Redis. On miss, it coalesces concurrent
// callers via singleflight, calls the backend, writes the fresh hash, and returns.
func (r *RedisCacheStore) Fetch(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
	fresh := FreshKey(game, username, platform, season)

	fields, err := r.client.HGetAll(ctx, fresh).Result()
	if err == nil {
		if stats := statsFromHash(fields); stats != nil {
			return *stats, nil
		}
	}

	flightKey := FreshKey(game, strings.ToLower(strings.TrimSpace(username)), platform, season)

	result := r.flight.Do(flightKey, func() fetchResult {
		stats, err := r.registry.Fetch(ctx, game, username, platform, season)
		return fetchResult{stats: stats, err: err}
	})

	if result.err != nil {
		return scrape.ScrapedStats{}, result.err
	}

	ttl := r.cfg.TTLFor(game)

	pJSON, _ := json.Marshal(result.stats.Profile)
	rJSON, _ := json.Marshal(result.stats.RankedStats)
	mJSON, _ := json.Marshal(result.stats.CalculatedMetrics)

	pipe := r.client.Pipeline()
	pipe.HSet(ctx, fresh, hProfile, string(pJSON))
	pipe.HSet(ctx, fresh, hRanked, string(rJSON))
	pipe.HSet(ctx, fresh, hMetrics, string(mJSON))
	pipe.Expire(ctx, fresh, ttl)
	_, _ = pipe.Exec(ctx)

	if r.onFetch != nil {
		r.onFetch(ctx, game, username, &result.stats)
	}

	return result.stats, nil
}

// FetchCollection checks the collection key in Redis, then falls back to
// the backend. No singleflight for collections.
func (r *RedisCacheStore) FetchCollection(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	key := CollectionKey(game, username, platform)

	fields, err := r.client.HGetAll(ctx, key).Result()
	if err == nil {
		if coll := collectionFromHash(fields); coll != nil {
			return *coll, nil
		}
	}

	result, err := r.registry.FetchCollection(ctx, game, username, platform)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, err
	}

	ttl := r.cfg.TTLFor(game)

	latestJSON, _ := json.Marshal(result.Latest)
	bySeasonJSON, _ := json.Marshal(result.BySeason)
	catalogJSON, _ := json.Marshal(result.SeasonCatalog)

	pipe := r.client.Pipeline()
	pipe.HSet(ctx, key, hLatest, string(latestJSON))
	pipe.HSet(ctx, key, hBySeason, string(bySeasonJSON))
	pipe.HSet(ctx, key, hCatalog, string(catalogJSON))
	pipe.Expire(ctx, key, ttl)
	_, _ = pipe.Exec(ctx)

	return result, nil
}
