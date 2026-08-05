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

	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	matchv1 "github.com/bake-computers/parley/gen/parley/matchmaking/v1"
	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
	"github.com/bake-computers/parley/internal/services"
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

// TestMatchmaking_CustomMatchRoundStatsAccumulate exercises the custom
// match persistence path end to end at the repo layer: create an active
// match with participants, accumulate two rounds of K/D/A via
// AddRoundStats, then complete the match and verify the totals survive
// into the history listing.
func TestMatchmaking_CustomMatchRoundStatsAccumulate(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()
	identityRepo := repos.NewIdentityRepo(bdb)
	guildRepo := repos.NewGuildRepo(bdb)
	matchRepo := repos.NewMatchRepo(bdb)

	guildID := fmt.Sprintf("mm_custom_%s", randomSuffix())
	discordIDs := make([]string, 4)
	playerIDs := make([]int32, 4)
	for i := 0; i < 4; i++ {
		discordID := fmt.Sprintf("mm_custom_user_%d_%s", i, randomSuffix())
		username := fmt.Sprintf("CustomPlayer%d", i)
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
		discordIDs[i] = discordID
		playerIDs[i] = player.ID
	}

	now := repos.NowMS()
	newMatch := &models.NewMatch{
		Game:                   models.GameR6,
		GuildID:                guildID,
		ChannelID:              "channel-1",
		MessageID:              "pending",
		CreatedByDiscordUserID: discordIDs[0],
		Status:                 repos.MatchStatusActive,
		MatchType:              "internal",
		ResolutionType:         "played",
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	teams := []string{"a", "a", "b", "b"}
	participants := make([]models.NewMatchParticipant, 0, 4)
	for i := 0; i < 4; i++ {
		participants = append(participants, models.NewMatchParticipant{
			Game:          models.GameR6,
			DiscordUserID: discordIDs[i],
			PlayerID:      playerIDs[i],
			Team:          teams[i],
			Slot:          int32(i % 2),
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}
	saved, _, err := matchRepo.Create(ctx, newMatch, participants)
	if err != nil {
		t.Fatalf("Create match: %v", err)
	}

	find := func(rows []models.MatchParticipantWithUsername, discordID string) models.MatchParticipantWithUsername {
		t.Helper()
		for _, p := range rows {
			if p.DiscordUserID == discordID {
				return p
			}
		}
		t.Fatalf("participant %s not found", discordID)
		return models.MatchParticipantWithUsername{}
	}
	kda := func(p models.MatchParticipantWithUsername) (int32, int32, int32) {
		t.Helper()
		if p.Kills == nil || p.Deaths == nil || p.Assists == nil {
			t.Fatalf("participant %s has nil K/D/A", p.DiscordUserID)
		}
		return *p.Kills, *p.Deaths, *p.Assists
	}

	// Fresh participants carry NULL K/D/A.
	rows, err := matchRepo.Participants(ctx, saved.ID)
	if err != nil {
		t.Fatalf("Participants: %v", err)
	}
	if got := len(rows); got != 4 {
		t.Fatalf("participants len = %d, want 4", got)
	}
	if p := find(rows, discordIDs[0]); p.Kills != nil || p.Deaths != nil || p.Assists != nil {
		t.Fatalf("expected nil K/D/A before any round, got %v/%v/%v", p.Kills, p.Deaths, p.Assists)
	}

	// Round 1.
	round1 := []repos.ParticipantRoundDelta{
		{DiscordUserID: discordIDs[0], Kills: 4, Deaths: 5, Assists: 2},
		{DiscordUserID: discordIDs[1], Kills: 0, Deaths: 3, Assists: 1},
		{DiscordUserID: discordIDs[2], Kills: 7, Deaths: 2, Assists: 0},
		{DiscordUserID: discordIDs[3], Kills: 1, Deaths: 4, Assists: 3},
	}
	if err := matchRepo.AddRoundStats(ctx, saved.ID, round1); err != nil {
		t.Fatalf("AddRoundStats(round 1): %v", err)
	}
	// Round 2.
	round2 := []repos.ParticipantRoundDelta{
		{DiscordUserID: discordIDs[0], Kills: 2, Deaths: 1, Assists: 0},
		{DiscordUserID: discordIDs[1], Kills: 5, Deaths: 0, Assists: 4},
		{DiscordUserID: discordIDs[2], Kills: 0, Deaths: 6, Assists: 1},
		{DiscordUserID: discordIDs[3], Kills: 3, Deaths: 3, Assists: 2},
	}
	if err := matchRepo.AddRoundStats(ctx, saved.ID, round2); err != nil {
		t.Fatalf("AddRoundStats(round 2): %v", err)
	}

	// Totals are the sum of both rounds, including zero-assist lines.
	rows, err = matchRepo.Participants(ctx, saved.ID)
	if err != nil {
		t.Fatalf("Participants: %v", err)
	}
	want := map[string][3]int32{
		discordIDs[0]: {6, 6, 2},
		discordIDs[1]: {5, 3, 5},
		discordIDs[2]: {7, 8, 1},
		discordIDs[3]: {4, 7, 5},
	}
	for discordID, w := range want {
		if k, d, a := kda(find(rows, discordID)); k != w[0] || d != w[1] || a != w[2] {
			t.Fatalf("%s totals = %d/%d/%d, want %d/%d/%d", discordID, k, d, a, w[0], w[1], w[2])
		}
	}

	// A delta for a non-participant rolls back the whole round.
	bogus := append([]repos.ParticipantRoundDelta{}, round1...)
	bogus = append(bogus, repos.ParticipantRoundDelta{DiscordUserID: "not-in-match", Kills: 9})
	if err := matchRepo.AddRoundStats(ctx, saved.ID, bogus); err == nil {
		t.Fatal("AddRoundStats with unknown participant: expected error, got nil")
	}
	rows, err = matchRepo.Participants(ctx, saved.ID)
	if err != nil {
		t.Fatalf("Participants: %v", err)
	}
	if k, d, a := kda(find(rows, discordIDs[0])); k != 6 || d != 6 || a != 2 {
		t.Fatalf("failed round was partially applied: %d/%d/%d", k, d, a)
	}

	// Complete and verify the match lands in guild history with stats intact.
	completed, err := matchRepo.Complete(ctx, models.GameR6, saved.ID, "a")
	if err != nil || completed == nil {
		t.Fatalf("Complete: %v (row %v)", err, completed)
	}
	if completed.Status != repos.MatchStatusCompleted || completed.WinningTeam == nil || *completed.WinningTeam != "a" {
		t.Fatalf("completed match state = %s/%v, want completed/a", completed.Status, completed.WinningTeam)
	}
	history, err := matchRepo.ListForGuild(ctx, models.GameR6, guildID, 10, nil)
	if err != nil {
		t.Fatalf("ListForGuild: %v", err)
	}
	if got := len(history); got != 1 {
		t.Fatalf("history len = %d, want 1", got)
	}
	if history[0].ID != saved.ID {
		t.Fatalf("history match = %d, want %d", history[0].ID, saved.ID)
	}
}

// TestMatchmaking_ReportMatchResultPersistsRatingAndPlayerState covers the
// post-match data path behind /history and /profile: ReportMatchResult stores
// each participant's membership movement on match_participants, exposes it on
// the wire Match, and mirrors the movement to the linked player row. A
// participant without a guild membership gets no update and does not block
// completion.
func TestMatchmaking_ReportMatchResultPersistsRatingAndPlayerState(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()
	identityRepo := repos.NewIdentityRepo(bdb)
	guildRepo := repos.NewGuildRepo(bdb)
	matchRepo := repos.NewMatchRepo(bdb)

	guildID := fmt.Sprintf("mm_delta_%s", randomSuffix())
	discordIDs := make([]string, 4)
	playerIDs := make([]int32, 4)
	for i := 0; i < 4; i++ {
		discordID := fmt.Sprintf("mm_delta_user_%d_%s", i, randomSuffix())
		username := fmt.Sprintf("DeltaPlayer%d", i)
		player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, username, "pc", nil, nil)
		if err != nil {
			t.Fatalf("UpsertPlayerByIdentity(%s): %v", username, err)
		}
		if _, err := identityRepo.LinkDiscordIdentity(ctx, models.GameR6, discordID, player.ID); err != nil {
			t.Fatalf("LinkDiscordIdentity(%s): %v", discordID, err)
		}
		// The last player never joins the guild: their rating update and
		// delta must be skipped non-fatally.
		if i < 3 {
			if _, err := guildRepo.UpsertMembership(ctx, models.GameR6, guildID, discordID, player.ID); err != nil {
				t.Fatalf("UpsertMembership(%s): %v", discordID, err)
			}
		}
		discordIDs[i] = discordID
		playerIDs[i] = player.ID
	}

	now := repos.NowMS()
	newMatch := &models.NewMatch{
		Game:                   models.GameR6,
		GuildID:                guildID,
		ChannelID:              "channel-1",
		MessageID:              "pending",
		CreatedByDiscordUserID: discordIDs[0],
		Status:                 repos.MatchStatusActive,
		MatchType:              "internal",
		ResolutionType:         "played",
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	teams := []string{"a", "a", "b", "b"}
	participants := make([]models.NewMatchParticipant, 0, 4)
	for i := 0; i < 4; i++ {
		participants = append(participants, models.NewMatchParticipant{
			Game:          models.GameR6,
			DiscordUserID: discordIDs[i],
			PlayerID:      playerIDs[i],
			Team:          teams[i],
			Slot:          int32(i % 2),
			BalanceRating: 1,
			CreatedAt:     now,
			UpdatedAt:     now,
		})
	}
	saved, _, err := matchRepo.Create(ctx, newMatch, participants)
	if err != nil {
		t.Fatalf("Create match: %v", err)
	}

	svc := services.NewMatchService(matchRepo, guildRepo, nil)
	resp, err := svc.ReportMatchResult(ctx, connect.NewRequest(&matchv1.ReportMatchResultRequest{
		MatchId:     saved.ID,
		Game:        commonv1.Game_GAME_R6,
		WinningTeam: "a",
	}))
	if err != nil {
		t.Fatalf("ReportMatchResult: %v", err)
	}
	if !resp.Msg.Success || resp.Msg.Match == nil || resp.Msg.Match.Status != repos.MatchStatusCompleted {
		t.Fatalf("ReportMatchResult response = %v, want completed match", resp.Msg)
	}

	rows, err := matchRepo.Participants(ctx, saved.ID)
	if err != nil {
		t.Fatalf("Participants: %v", err)
	}
	wire := map[string]*matchv1.MatchParticipant{}
	for _, p := range resp.Msg.Match.Participants {
		wire[p.DiscordUserId] = p
	}
	for _, p := range rows {
		wireParticipant, ok := wire[p.DiscordUserID]
		if !ok {
			t.Fatalf("wire participant %s missing", p.DiscordUserID)
		}
		wantSign := 0.0
		if p.Team == "a" {
			wantSign = 1.0 // winners gain
		} else {
			wantSign = -1.0 // losers drop
		}
		if p.DiscordUserID == discordIDs[3] {
			if p.RatingDelta != nil {
				t.Fatalf("membership-less participant delta = %v, want nil", *p.RatingDelta)
			}
			if wireParticipant.RatingDelta != nil {
				t.Fatalf("wire delta for membership-less participant = %v, want nil", *wireParticipant.RatingDelta)
			}
			continue
		}
		if p.RatingDelta == nil {
			t.Fatalf("participant %s has nil rating delta", p.DiscordUserID)
		}
		got := *p.RatingDelta
		if (got > 0) != (wantSign > 0) || got == 0 {
			t.Fatalf("participant %s delta = %v, want sign %v", p.DiscordUserID, got, wantSign)
		}
		if w := wireParticipant.GetRatingDelta(); w != got {
			t.Fatalf("wire delta %v != stored delta %v for %s", w, got, p.DiscordUserID)
		}
	}

	// The stored delta equals the membership's elo movement.
	members, err := guildRepo.FindMembersByDiscordIDs(ctx, models.GameR6, guildID, []string{discordIDs[0]})
	if err != nil || len(members) == 0 {
		t.Fatalf("FindMembersByDiscordIDs: %v (len %d)", err, len(members))
	}
	var stored float64
	for _, p := range rows {
		if p.DiscordUserID == discordIDs[0] {
			if p.RatingDelta == nil {
				t.Fatalf("winner participant has nil rating delta")
			}
			stored = *p.RatingDelta
		}
	}
	if moved := members[0].InternalElo - 1000; moved != stored {
		t.Fatalf("membership moved %v, stored delta %v", moved, stored)
	}

	for i, playerID := range playerIDs {
		player, err := identityRepo.FindPlayer(ctx, playerID)
		if err != nil {
			t.Fatalf("FindPlayer(%d): %v", playerID, err)
		}
		if player == nil {
			t.Fatalf("FindPlayer(%d): player not found", playerID)
		}
		if i == 3 {
			if player.InternalElo != 1000 || player.InternalMatches != 0 || player.InternalWins != 0 || player.InternalLosses != 0 {
				t.Fatalf("membership-less player state = %+v, want untouched", player)
			}
			continue
		}
		if player.InternalMatches != 1 {
			t.Fatalf("player %d matches = %d, want 1", playerID, player.InternalMatches)
		}
		if teams[i] == "a" {
			if player.InternalElo <= 1000 || player.InternalWins != 1 || player.InternalLosses != 0 {
				t.Fatalf("winner player state = %+v, want rating increase and 1 win", player)
			}
		} else if player.InternalElo >= 1000 || player.InternalWins != 0 || player.InternalLosses != 1 {
			t.Fatalf("loser player state = %+v, want rating decrease and 1 loss", player)
		}
	}

	// A second report must not re-apply ratings or rewrite deltas.
	_, err = svc.ReportMatchResult(ctx, connect.NewRequest(&matchv1.ReportMatchResultRequest{
		MatchId:     saved.ID,
		Game:        commonv1.Game_GAME_R6,
		WinningTeam: "b",
	}))
	if err == nil {
		t.Fatal("second ReportMatchResult succeeded, want FailedPrecondition")
	}
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("second ReportMatchResult code = %v, want FailedPrecondition (err=%v)", connect.CodeOf(err), err)
	}
	after, err := matchRepo.Participants(ctx, saved.ID)
	if err != nil {
		t.Fatalf("Participants after re-report: %v", err)
	}
	for _, p := range after {
		if p.DiscordUserID == discordIDs[0] && (p.RatingDelta == nil || *p.RatingDelta != stored) {
			t.Fatalf("re-report rewrote delta: got %v, want %v", p.RatingDelta, stored)
		}
	}
}

// TestMatchmaking_GuildDefaultTeamFormatIsBounded covers the fallback
// half of the team_size bound: when the request omits team_size, the
// size comes from the guild's default_team_format, which is equally
// attacker-influenced (a guild admin can set "16v16"). An oversized
// default must be rejected before it reaches PartitionModelTeams'
// C(2t-1, t-1) subset enumeration.
func TestMatchmaking_GuildDefaultTeamFormatIsBounded(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()
	guildRepo := repos.NewGuildRepo(bdb)
	guildID := fmt.Sprintf("mm_default_%s", randomSuffix())

	if _, err := guildRepo.UpsertSettings(ctx, &models.GuildSettings{
		GuildID:                guildID,
		Game:                   models.GameR6,
		DefaultTeamFormat:      strPtr("16v16"),
		AutoBalance:            true,
		UpdatedAt:              repos.NowMS(),
		UpdatedByDiscordUserID: "mm_default_admin",
		MatchmakingEnabled:     true,
	}); err != nil {
		t.Fatalf("UpsertSettings: %v", err)
	}

	// 32 ids so the request is correctly sized for the 16v16 default:
	// the only rejectable input is the resolved team size.
	ids := make([]string, 32)
	for i := range ids {
		ids[i] = fmt.Sprintf("u%d", i)
	}

	svc := services.NewMatchService(nil, guildRepo, nil)
	_, err := svc.BuildTeams(ctx, connect.NewRequest(&matchv1.BuildTeamsRequest{
		GuildId:        guildID,
		Game:           commonv1.Game_GAME_R6,
		TeamSize:       0, // force the guild-default fallback
		DiscordUserIds: ids,
	}))
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("BuildTeams error = %v, want CodeInvalidArgument", err)
	}
}

func strPtr(s string) *string { return &s }

func randomSuffix() string {
	return fmt.Sprintf("%d", repos.NowMS())
}
