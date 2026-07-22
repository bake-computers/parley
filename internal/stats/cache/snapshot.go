package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/pactum-computers/parley/internal/models"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// IdentityReader resolves players by normalized username.
type IdentityReader interface {
	FindPlayerByUsernameNormalized(ctx context.Context, game models.Game, username string) (*models.Player, error)
}

// SnapshotReader loads the most recent stat snapshot for a player.
type SnapshotReader interface {
	LatestForPlayer(ctx context.Context, game models.Game, playerID int32) (*models.PlayerStatSnapshot, error)
}

// StatsFetcher fetches live stats from the upstream provider.
type StatsFetcher interface {
	FetchStats(ctx context.Context, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error)
	FetchStatsCollection(ctx context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

// SnapshotCacheStore is a read-through stats cache over
// player_stat_snapshots. A snapshot younger than the configured TTL is
// decoded from its stored payload; otherwise the upstream fetch is
// deduplicated via singleflight and served live. The store never writes
// snapshots itself — persistence stays asynchronous in the outer
// persist.PersistingStatsCacheStore wrapper.
type SnapshotCacheStore struct {
	identity  IdentityReader
	snapshots SnapshotReader
	client    StatsFetcher
	cfg       CacheConfig
	flight    *SingleFlight[string, scrape.ScrapedStats]
}

// NewSnapshotCacheStore returns a snapshot-backed CacheStore.
func NewSnapshotCacheStore(
	identity IdentityReader,
	snapshots SnapshotReader,
	client StatsFetcher,
	cfg CacheConfig,
) *SnapshotCacheStore {
	return &SnapshotCacheStore{
		identity:  identity,
		snapshots: snapshots,
		client:    client,
		cfg:       cfg,
		flight:    NewSingleFlight[string, scrape.ScrapedStats](),
	}
}

// Fetch returns stats for the player, preferring a fresh snapshot.
// Requests for a specific season always go upstream: snapshots carry no
// season marker and store only the latest fetch.
func (s *SnapshotCacheStore) Fetch(
	ctx context.Context,
	username string,
	platform fetch.StatsPlatform,
	season *string,
) (scrape.ScrapedStats, error) {
	if season == nil {
		stats, ok, err := s.fetchFromSnapshot(ctx, username)
		if err != nil {
			return scrape.ScrapedStats{}, err
		}
		if ok {
			return stats, nil
		}
	}
	key := FreshKey(username, platform, season)
	stats, err, _ := s.flight.DoErr(key, func() (scrape.ScrapedStats, error) {
		return s.client.FetchStats(ctx, username, platform, season)
	})
	return stats, err
}

// FetchCollection always fetches live: collection payloads (per-season
// breakdowns plus the season catalog) are not reconstructable from a
// single snapshot row.
func (s *SnapshotCacheStore) FetchCollection(
	ctx context.Context,
	username string,
	platform fetch.StatsPlatform,
) (scrape.ScrapedStatsCollection, error) {
	return s.client.FetchStatsCollection(ctx, username, platform)
}

func (s *SnapshotCacheStore) fetchFromSnapshot(
	ctx context.Context,
	username string,
) (scrape.ScrapedStats, bool, error) {
	player, err := s.identity.FindPlayerByUsernameNormalized(ctx, models.GameR6, username)
	if err != nil {
		return scrape.ScrapedStats{}, false, err
	}
	if player == nil {
		return scrape.ScrapedStats{}, false, nil
	}
	snapshot, err := s.snapshots.LatestForPlayer(ctx, models.GameR6, player.ID)
	if err != nil {
		return scrape.ScrapedStats{}, false, err
	}
	if snapshot == nil {
		return scrape.ScrapedStats{}, false, nil
	}
	age := time.Duration(time.Now().UnixMilli()-snapshot.FetchedAt) * time.Millisecond
	if age >= s.cfg.TTL() {
		return scrape.ScrapedStats{}, false, nil
	}
	var stats scrape.ScrapedStats
	if err := json.Unmarshal([]byte(snapshot.PayloadJSON), &stats); err != nil {
		// A payload that no longer decodes (e.g. schema drift between
		// deploys) is treated as a miss rather than a failure.
		return scrape.ScrapedStats{}, false, nil
	}
	return stats, true, nil
}
