package cache

import (
	"context"
	"encoding/json"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pactum-computers/parley/internal/models"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

type stubIdentity struct {
	player *models.Player
	err    error
}

func (s *stubIdentity) FindPlayerByUsernameNormalized(
	_ context.Context,
	_ models.Game,
	_ string,
) (*models.Player, error) {
	return s.player, s.err
}

type stubSnapshots struct {
	row *models.PlayerStatSnapshot
	err error
}

func (s *stubSnapshots) LatestForPlayer(
	_ context.Context,
	_ models.Game,
	_ int32,
) (*models.PlayerStatSnapshot, error) {
	return s.row, s.err
}

type stubClient struct {
	fetchCalls      atomic.Int64
	collectionCalls atomic.Int64
	stats           scrape.ScrapedStats
	collection      scrape.ScrapedStatsCollection
	err             error
	blockUntil      chan struct{}
}

func (s *stubClient) FetchStats(
	_ context.Context,
	_ string,
	_ fetch.StatsPlatform,
	_ *string,
) (scrape.ScrapedStats, error) {
	s.fetchCalls.Add(1)
	if s.blockUntil != nil {
		<-s.blockUntil
	}
	return s.stats, s.err
}

func (s *stubClient) FetchStatsCollection(
	_ context.Context,
	_ string,
	_ fetch.StatsPlatform,
) (scrape.ScrapedStatsCollection, error) {
	s.collectionCalls.Add(1)
	return s.collection, s.err
}

func payloadFor(username string) string {
	raw, err := json.Marshal(scrape.ScrapedStats{
		Profile: scrape.StatsProfile{Username: username},
	})
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func newSnapshotRow(fetchedAt int64, payload string) *models.PlayerStatSnapshot {
	return &models.PlayerStatSnapshot{
		ID:          1,
		PlayerID:    7,
		Game:        models.GameR6,
		FetchedAt:   fetchedAt,
		PayloadJSON: payload,
	}
}

func TestSnapshotFetchFreshHit(t *testing.T) {
	client := &stubClient{}
	store := NewSnapshotCacheStore(
		&stubIdentity{player: &models.Player{ID: 7}},
		&stubSnapshots{row: newSnapshotRow(time.Now().UnixMilli(), payloadFor("cached"))},
		client,
		CacheConfig{TTLR6: time.Minute},
	)

	got, err := store.Fetch(context.Background(), "player1", fetch.StatsPlatformAuto, nil)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if got.Profile.Username != "cached" {
		t.Errorf("username = %q, want cached", got.Profile.Username)
	}
	if n := client.fetchCalls.Load(); n != 0 {
		t.Errorf("fetch calls = %d, want 0", n)
	}
}

func TestSnapshotFetchStaleMiss(t *testing.T) {
	client := &stubClient{stats: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "live"}}}
	store := NewSnapshotCacheStore(
		&stubIdentity{player: &models.Player{ID: 7}},
		&stubSnapshots{row: newSnapshotRow(time.Now().Add(-2*time.Minute).UnixMilli(), payloadFor("cached"))},
		client,
		CacheConfig{TTLR6: time.Minute},
	)

	got, err := store.Fetch(context.Background(), "player1", fetch.StatsPlatformAuto, nil)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if got.Profile.Username != "live" {
		t.Errorf("username = %q, want live", got.Profile.Username)
	}
	if n := client.fetchCalls.Load(); n != 1 {
		t.Errorf("fetch calls = %d, want 1", n)
	}
}

func TestSnapshotFetchUnknownPlayer(t *testing.T) {
	client := &stubClient{stats: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "live"}}}
	store := NewSnapshotCacheStore(
		&stubIdentity{player: nil},
		&stubSnapshots{},
		client,
		CacheConfig{TTLR6: time.Minute},
	)

	got, err := store.Fetch(context.Background(), "newcomer", fetch.StatsPlatformAuto, nil)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if got.Profile.Username != "live" {
		t.Errorf("username = %q, want live", got.Profile.Username)
	}
	if n := client.fetchCalls.Load(); n != 1 {
		t.Errorf("fetch calls = %d, want 1", n)
	}
}

func TestSnapshotFetchNoSnapshotRow(t *testing.T) {
	client := &stubClient{stats: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "live"}}}
	store := NewSnapshotCacheStore(
		&stubIdentity{player: &models.Player{ID: 7}},
		&stubSnapshots{row: nil},
		client,
		CacheConfig{TTLR6: time.Minute},
	)

	if _, err := store.Fetch(context.Background(), "player1", fetch.StatsPlatformAuto, nil); err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if n := client.fetchCalls.Load(); n != 1 {
		t.Errorf("fetch calls = %d, want 1", n)
	}
}

func TestSnapshotFetchSeasonBypassesSnapshot(t *testing.T) {
	client := &stubClient{stats: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "live"}}}
	store := NewSnapshotCacheStore(
		&stubIdentity{player: &models.Player{ID: 7}},
		&stubSnapshots{row: newSnapshotRow(time.Now().UnixMilli(), payloadFor("cached"))},
		client,
		CacheConfig{TTLR6: time.Minute},
	)
	season := "y9s1"

	got, err := store.Fetch(context.Background(), "player1", fetch.StatsPlatformAuto, &season)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if got.Profile.Username != "live" {
		t.Errorf("username = %q, want live (season requests must bypass snapshots)", got.Profile.Username)
	}
	if n := client.fetchCalls.Load(); n != 1 {
		t.Errorf("fetch calls = %d, want 1", n)
	}
}

func TestSnapshotFetchCorruptPayloadTreatedAsMiss(t *testing.T) {
	client := &stubClient{stats: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "live"}}}
	store := NewSnapshotCacheStore(
		&stubIdentity{player: &models.Player{ID: 7}},
		&stubSnapshots{row: newSnapshotRow(time.Now().UnixMilli(), "{not-json")},
		client,
		CacheConfig{TTLR6: time.Minute},
	)

	got, err := store.Fetch(context.Background(), "player1", fetch.StatsPlatformAuto, nil)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if got.Profile.Username != "live" {
		t.Errorf("username = %q, want live", got.Profile.Username)
	}
}

func TestSnapshotFetchSingleflightDedup(t *testing.T) {
	block := make(chan struct{})
	client := &stubClient{
		stats:      scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "live"}},
		blockUntil: block,
	}
	store := NewSnapshotCacheStore(
		&stubIdentity{player: &models.Player{ID: 7}},
		&stubSnapshots{row: nil},
		client,
		CacheConfig{TTLR6: time.Minute},
	)

	const workers = 10
	results := make(chan scrape.ScrapedStats, workers)
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		go func() {
			stats, err := store.Fetch(context.Background(), "player1", fetch.StatsPlatformAuto, nil)
			results <- stats
			errs <- err
		}()
	}
	// Wait for the in-flight fetch to start, then give the remaining
	// workers time to coalesce on the same singleflight key.
	deadline := time.Now().Add(time.Second)
	for client.fetchCalls.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(20 * time.Millisecond)
	close(block)

	for i := 0; i < workers; i++ {
		if err := <-errs; err != nil {
			t.Fatalf("Fetch() error = %v", err)
		}
		<-results
	}
	if n := client.fetchCalls.Load(); n != 1 {
		t.Errorf("fetch calls = %d, want 1 (singleflight dedup)", n)
	}
}

func TestSnapshotFetchUpstreamError(t *testing.T) {
	wantErr := errors.New("upstream down")
	client := &stubClient{err: wantErr}
	store := NewSnapshotCacheStore(
		&stubIdentity{player: nil},
		&stubSnapshots{},
		client,
		CacheConfig{TTLR6: time.Minute},
	)

	if _, err := store.Fetch(context.Background(), "player1", fetch.StatsPlatformAuto, nil); !errors.Is(err, wantErr) {
		t.Fatalf("Fetch() error = %v, want %v", err, wantErr)
	}
}

func TestSnapshotFetchIdentityError(t *testing.T) {
	wantErr := errors.New("db down")
	client := &stubClient{}
	store := NewSnapshotCacheStore(
		&stubIdentity{err: wantErr},
		&stubSnapshots{},
		client,
		CacheConfig{TTLR6: time.Minute},
	)

	if _, err := store.Fetch(context.Background(), "player1", fetch.StatsPlatformAuto, nil); !errors.Is(err, wantErr) {
		t.Fatalf("Fetch() error = %v, want %v", err, wantErr)
	}
	if n := client.fetchCalls.Load(); n != 0 {
		t.Errorf("fetch calls = %d, want 0", n)
	}
}

func TestSnapshotFetchCollectionAlwaysLive(t *testing.T) {
	client := &stubClient{collection: scrape.ScrapedStatsCollection{
		Latest: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "live"}},
	}}
	store := NewSnapshotCacheStore(
		&stubIdentity{player: &models.Player{ID: 7}},
		&stubSnapshots{row: newSnapshotRow(time.Now().UnixMilli(), payloadFor("cached"))},
		client,
		CacheConfig{TTLR6: time.Minute},
	)

	got, err := store.FetchCollection(context.Background(), "player1", fetch.StatsPlatformAuto)
	if err != nil {
		t.Fatalf("FetchCollection() error = %v", err)
	}
	if got.Latest.Profile.Username != "live" {
		t.Errorf("username = %q, want live", got.Latest.Profile.Username)
	}
	if n := client.collectionCalls.Load(); n != 1 {
		t.Errorf("collection calls = %d, want 1", n)
	}
}
