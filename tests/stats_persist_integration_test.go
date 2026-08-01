//go:build integration
// +build integration

package tests

import (
	"context"
	"testing"

	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
	"github.com/bake-computers/parley/internal/stats/persist"
	"github.com/bake-computers/parley/internal/stats/scrape"
)

// A fetched profile on one platform must not write snapshots or seed
// internal_elo onto a same-username player row of another platform
// (F28/F29/F30: cross-platform rating contamination).
func TestPersistSnapshot_PlatformScoped(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()
	ctx := context.Background()

	identityRepo := repos.NewIdentityRepo(bdb)
	snapshotRepo := repos.NewPlayerStatSnapshotRepo(bdb)
	writer := &persist.DBSnapshotWriter{Identity: identityRepo, Snapshots: snapshotRepo}

	player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, "Frost", "playstation", nil, nil)
	if err != nil {
		t.Fatalf("upsert player: %v", err)
	}

	pcProfile := scrape.ScrapedStats{
		Profile:     scrape.StatsProfile{Username: "Frost", Platform: "pc"},
		RankedStats: scrape.RankedStats{RoundsPlayed: 10, RankPoints: 4000, Matches: 5},
	}
	if err := writer.PersistSnapshot(ctx, &pcProfile); err != nil {
		t.Fatalf("persist PC profile: %v", err)
	}

	snaps, err := snapshotRepo.LatestForPlayers(ctx, models.GameR6, []int32{player.ID})
	if err != nil {
		t.Fatalf("latest snapshots: %v", err)
	}
	if len(snaps) != 0 {
		t.Fatalf("PC profile wrote %d snapshot(s) onto a playstation player row", len(snaps))
	}
	row, err := identityRepo.FindPlayer(ctx, player.ID)
	if err != nil {
		t.Fatalf("find player: %v", err)
	}
	if row.InternalElo != 1000 {
		t.Fatalf("internal_elo = %v, want default 1000 (PC profile must not seed a PSN row)", row.InternalElo)
	}

	// The matching platform persists and seeds.
	psnProfile := pcProfile
	psnProfile.Profile.Platform = "playstation"
	psnProfile.RankedStats.RankPoints = 3000
	if err := writer.PersistSnapshot(ctx, &psnProfile); err != nil {
		t.Fatalf("persist playstation profile: %v", err)
	}
	snaps, err = snapshotRepo.LatestForPlayers(ctx, models.GameR6, []int32{player.ID})
	if err != nil {
		t.Fatalf("latest snapshots: %v", err)
	}
	if len(snaps) != 1 {
		t.Fatalf("snapshots = %d, want 1", len(snaps))
	}
	row, err = identityRepo.FindPlayer(ctx, player.ID)
	if err != nil {
		t.Fatalf("find player: %v", err)
	}
	if row.InternalElo != 3000 {
		t.Fatalf("internal_elo = %v, want 3000", row.InternalElo)
	}
}

// A profile with no platform must be dropped rather than resolved by
// username alone.
func TestPersistSnapshot_UnknownPlatformSkipped(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()
	ctx := context.Background()

	identityRepo := repos.NewIdentityRepo(bdb)
	snapshotRepo := repos.NewPlayerStatSnapshotRepo(bdb)
	writer := &persist.DBSnapshotWriter{Identity: identityRepo, Snapshots: snapshotRepo}

	player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, "Frost", "playstation", nil, nil)
	if err != nil {
		t.Fatalf("upsert player: %v", err)
	}

	noPlatform := scrape.ScrapedStats{
		Profile:     scrape.StatsProfile{Username: "Frost"},
		RankedStats: scrape.RankedStats{RoundsPlayed: 10, RankPoints: 4000},
	}
	if err := writer.PersistSnapshot(ctx, &noPlatform); err != nil {
		t.Fatalf("persist: %v", err)
	}
	snaps, err := snapshotRepo.LatestForPlayers(ctx, models.GameR6, []int32{player.ID})
	if err != nil {
		t.Fatalf("latest snapshots: %v", err)
	}
	if len(snaps) != 0 {
		t.Fatalf("platformless profile wrote %d snapshot(s)", len(snaps))
	}
}

// Upstream rank_points are untrusted: extreme values must not seed
// internal_elo beyond the live R6 band.
func TestSeedEloIfUnrated_CapsExtremeRankPoints(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()
	ctx := context.Background()

	identityRepo := repos.NewIdentityRepo(bdb)
	player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, "Smurf", "pc", nil, nil)
	if err != nil {
		t.Fatalf("upsert player: %v", err)
	}

	if err := identityRepo.SeedEloIfUnrated(ctx, player.ID, 2147483647); err != nil {
		t.Fatalf("seed: %v", err)
	}
	row, err := identityRepo.FindPlayer(ctx, player.ID)
	if err != nil {
		t.Fatalf("find player: %v", err)
	}
	if row.InternalElo != 10000 {
		t.Fatalf("internal_elo = %v, want capped 10000", row.InternalElo)
	}
}
