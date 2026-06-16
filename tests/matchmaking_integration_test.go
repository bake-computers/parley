//go:build integration
// +build integration

// Matchmaking integration tests — data-layer round-trips.
//
// Ported from tests/matchmaking.rs. The Rust suite tested two scenarios
// directly against the Diesel repos:
//
//  1. list_guild_members_returns_registered_roster — creates 3 players,
//     links identities, joins guild membership, then asserts the guild
//     member list returns all 3.
//
//  2. build_teams_data_layer_loads_snapshots_and_memberships — creates
//     10 players with stat snapshots and guild settings, then asserts
//     the membership and snapshot queries return 10 rows each.
//
// The Go port exercises the same repos (IdentityRepo, GuildRepo,
// PlayerStatSnapshotRepo) via bun against a testcontainers Postgres.
// This keeps the tests faithful to the Rust originals while staying
// within the Go repo layer.
package tests

import (
	"context"
	"fmt"
	"testing"

	"github.com/parley-bot/parley/internal/models"
	"github.com/parley-bot/parley/internal/repos"
)

// TestMatchmaking_ListGuildMembersReturnsRegisteredRoster mirrors the
// Rust `list_guild_members_returns_registered_roster` test. It creates
// 3 players, links their Discord identities, adds them to a guild,
// then verifies ListMembersForGuild returns all 3.
func TestMatchmaking_ListGuildMembersReturnsRegisteredRoster(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()
	identityRepo := repos.NewIdentityRepo(bdb)
	guildRepo := repos.NewGuildRepo(bdb)

	guildID := fmt.Sprintf("mm_guild_%s", randomSuffix())
	discordIDs := make([]string, 3)
	for i := range discordIDs {
		discordIDs[i] = fmt.Sprintf("mm_user_%d_%s", i, randomSuffix())
	}

	for i, discordID := range discordIDs {
		username := fmt.Sprintf("MMPlayer%d", i)
		player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, username, "pc", nil, nil)
		if err != nil {
			t.Fatalf("UpsertPlayerByIdentity(%s): %v", username, err)
		}
		if _, err := identityRepo.LinkDiscordIdentity(ctx, models.GameR6, discordID, player.ID); err != nil {
			t.Fatalf("LinkDiscordIdentity(%s): %v", discordID, err)
		}
		if _, err := guildRepo.UpsertMembership(ctx, models.GameR6, guildID, discordID, player.ID); err != nil {
			t.Fatalf("UpsertMembership(%s): %v", discordID, err)
		}
	}

	members, err := guildRepo.ListMembersForGuild(ctx, models.GameR6, guildID)
	if err != nil {
		t.Fatalf("ListMembersForGuild: %v", err)
	}
	if got := len(members); got != 3 {
		t.Fatalf("members len = %d, want 3", got)
	}
}

// TestMatchmaking_BuildTeamsDataLayerLoadsSnapshotsAndMemberships
// mirrors the Rust `build_teams_data_layer_loads_snapshots_and_memberships`
// test. It creates 10 players with stat snapshots and guild settings,
// then verifies the membership and snapshot queries each return 10 rows.
func TestMatchmaking_BuildTeamsDataLayerLoadsSnapshotsAndMemberships(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()
	identityRepo := repos.NewIdentityRepo(bdb)
	guildRepo := repos.NewGuildRepo(bdb)
	snapshotRepo := repos.NewPlayerStatSnapshotRepo(bdb)

	guildID := fmt.Sprintf("mm_build_%s", randomSuffix())
	now := repos.NowMS()
	discordIDs := make([]string, 10)
	playerIDs := make([]int32, 10)

	for i := 0; i < 10; i++ {
		discordID := fmt.Sprintf("mm_build_user_%d_%s", i, randomSuffix())
		username := fmt.Sprintf("BuildPlayer%d", i)

		player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, username, "pc", nil, nil)
		if err != nil {
			t.Fatalf("UpsertPlayerByIdentity(%s): %v", username, err)
		}
		if _, err := identityRepo.LinkDiscordIdentity(ctx, models.GameR6, discordID, player.ID); err != nil {
			t.Fatalf("LinkDiscordIdentity(%s): %v", discordID, err)
		}
		if _, err := guildRepo.UpsertMembership(ctx, models.GameR6, guildID, discordID, player.ID); err != nil {
			t.Fatalf("UpsertMembership(%s): %v", discordID, err)
		}

		// Insert a stat snapshot for this player.
		metadata := []byte(`{"rounds_played":100,"kill_rounds":40,"survival_rounds":30,"traded_rounds":10}`)
		snap := &models.NewPlayerStatSnapshot{
			PlayerID:           player.ID,
			Game:               models.GameR6,
			FetchedAt:          now,
			Source:             "test",
			CacheVersion:       1,
			CurrentRank:        strPtr("gold"),
			RankPoints:         3000 + int32(i)*50,
			Matches:            100,
			Wins:               50 + int32(i),
			Losses:             50 - int32(i),
			Kills:              500 + int32(i)*10,
			Deaths:             400,
			Assists:            100,
			Headshots:          200,
			KDRatio:            1.0 + float64(i)*0.05,
			HeadshotPercentage: 40.0,
			WinRate:            50.0 + float64(i),
			Kost:               60.0,
			Metadata:           metadata,
			PayloadJSON:        "{}",
			CreatedAt:          now,
		}
		if _, err := snapshotRepo.Insert(ctx, snap); err != nil {
			t.Fatalf("InsertSnapshot(%d): %v", i, err)
		}

		discordIDs[i] = discordID
		playerIDs[i] = player.ID
	}

	// Upsert guild settings.
	if _, err := guildRepo.UpsertSettings(ctx, &models.GuildSettings{
		GuildID:                guildID,
		Game:                   models.GameR6,
		DefaultTeamFormat:      strPtr("5v5"),
		AutoBalance:            true,
		CrossGuildMatchmaking:  false,
		UpdatedAt:              now,
		UpdatedByDiscordUserID: discordIDs[0],
		DefaultLanguage:        models.LanguageEn,
		MatchmakingEnabled:     true,
	}); err != nil {
		t.Fatalf("UpsertSettings: %v", err)
	}

	// Verify membership count.
	members, err := guildRepo.ListMembersForGuild(ctx, models.GameR6, guildID)
	if err != nil {
		t.Fatalf("ListMembersForGuild: %v", err)
	}
	if got := len(members); got != 10 {
		t.Fatalf("members len = %d, want 10", got)
	}

	// Verify snapshot count.
	snaps, err := snapshotRepo.LatestForPlayers(ctx, models.GameR6, playerIDs)
	if err != nil {
		t.Fatalf("LatestForPlayers: %v", err)
	}
	if got := len(snaps); got != 10 {
		t.Fatalf("snapshots len = %d, want 10", got)
	}
}

func strPtr(s string) *string { return &s }

func randomSuffix() string {
	return fmt.Sprintf("%d", repos.NowMS())
}
