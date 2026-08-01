//go:build integration
// +build integration

// Tournament integration tests — create and list round-trip.
//
// Ported from tests/tournament.rs. The Rust suite tested
// tournament_create_and_list: creates a tournament via TournamentRepo,
// then lists for the guild and asserts exactly 1 row is returned with
// the same ID.
//
// The Go port exercises TournamentRepo.Create and
// TournamentRepo.ListForGuild against a testcontainers Postgres via
// bun, keeping the test faithful to the Rust original.
package tests

import (
	"context"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	tournamentv1 "github.com/bake-computers/parley/gen/parley/tournament/v1"
	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
	"github.com/bake-computers/parley/internal/services"
)

// TestTournament_CreateAndList mirrors the Rust
// tournament_create_and_list test. It creates a tournament row via the
// repo, then lists tournaments for the guild and asserts the returned
// slice contains exactly the one just created.
func TestTournament_CreateAndList(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()
	tournRepo := repos.NewTournamentRepo(bdb)

	guildID := fmt.Sprintf("t_guild_%s", randomSuffix())
	now := repos.NowMS()

	created, err := tournRepo.Create(ctx, &models.NewTournament{
		Game:                   models.GameR6,
		Name:                   "Friday Cup",
		NameNormalized:         "friday cup",
		Format:                 "5v5 single_elimination",
		TeamCap:                4,
		Visibility:             "public",
		Status:                 "open",
		CreatedByGuildID:       guildID,
		CreatedByChannelID:     "chan",
		CreatedByDiscordUserID: "creator",
		CreatedAt:              now,
		UpdatedAt:              now,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID == 0 {
		t.Fatal("Create: returned ID = 0, want non-zero")
	}

	listed, err := tournRepo.ListForGuild(ctx, models.GameR6, guildID, nil, 10)
	if err != nil {
		t.Fatalf("ListForGuild: %v", err)
	}
	if got := len(listed); got != 1 {
		t.Fatalf("listed len = %d, want 1", got)
	}
	if listed[0].ID != created.ID {
		t.Errorf("listed[0].ID = %d, want %d", listed[0].ID, created.ID)
	}
	if listed[0].Name != "Friday Cup" {
		t.Errorf("listed[0].Name = %q, want %q", listed[0].Name, "Friday Cup")
	}
}

// TestTournament_LifecycleAuthorization verifies that start, cancel, and
// bracket-result operations bind to the verified creator identity rather
// than a caller-supplied body field that any caller can spoof
// (F4/F11/F19/F23/F32).
func TestTournament_LifecycleAuthorization(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()
	tournRepo := repos.NewTournamentRepo(bdb)
	teamsRepo := repos.NewTournamentTeamRepo(bdb)
	rostersRepo := repos.NewTournamentRosterRepo(bdb)
	bracketsRepo := repos.NewBracketMatchRepo(bdb)
	svc := services.NewTournamentService(bdb, tournRepo, teamsRepo, rostersRepo, bracketsRepo, nil)

	creator := fmt.Sprintf("t_creator_%s", randomSuffix())
	outsider := fmt.Sprintf("t_outsider_%s", randomSuffix())
	now := repos.NowMS()
	created, err := tournRepo.Create(ctx, &models.NewTournament{
		Game:                   models.GameR6,
		Name:                   "Authz Cup",
		NameNormalized:         fmt.Sprintf("authz cup %s", randomSuffix()),
		Format:                 "5v5 single_elimination",
		TeamCap:                4,
		Visibility:             "public",
		Status:                 repos.TournamentStatusOpen,
		StartMode:              "manual",
		MinTeams:               2,
		CreatedByGuildID:       fmt.Sprintf("t_guild_%s", randomSuffix()),
		CreatedByChannelID:     "chan",
		CreatedByDiscordUserID: creator,
		CreatedAt:              now,
		UpdatedAt:              now,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	start := func(acting string) error {
		req := connect.NewRequest(&tournamentv1.StartTournamentRequest{
			Game:         commonv1.Game_GAME_R6,
			TournamentId: created.ID,
		})
		if acting != "" {
			req.Header().Set(services.ActingUserIDHeader, acting)
		}
		_, err := svc.StartTournament(ctx, req)
		return err
	}
	cancel := func(acting string) error {
		req := connect.NewRequest(&tournamentv1.CancelTournamentRequest{
			Game:         commonv1.Game_GAME_R6,
			TournamentId: created.ID,
		})
		if acting != "" {
			req.Header().Set(services.ActingUserIDHeader, acting)
		}
		_, err := svc.CancelTournament(ctx, req)
		return err
	}

	if err := start(""); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("start with no acting identity: code = %v, want PermissionDenied (err = %v)", connectErrCode(err), err)
	}
	if err := start(outsider); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("start by non-creator: code = %v, want PermissionDenied", connectErrCode(err))
	}
	// The creator passes the gate and fails later on the team count.
	if err := start(creator); connectErrCode(err) != connect.CodeFailedPrecondition {
		t.Fatalf("start by creator: code = %v, want FailedPrecondition (team count), err = %v", connectErrCode(err), err)
	}

	saved, err := bracketsRepo.InsertBatch(ctx, []models.NewBracketMatch{{
		Game:         models.GameR6,
		TournamentID: created.ID,
		Bracket:      "winners",
		RoundNumber:  1,
		MatchNumber:  1,
		Status:       "pending",
		CreatedAt:    now,
		UpdatedAt:    now,
	}})
	if err != nil {
		t.Fatalf("InsertBatch: %v", err)
	}
	report := func(acting string) error {
		req := connect.NewRequest(&tournamentv1.ReportBracketResultRequest{
			Game:           commonv1.Game_GAME_R6,
			BracketMatchId: saved[0].ID,
			WinnerTeamId:   1,
		})
		if acting != "" {
			req.Header().Set(services.ActingUserIDHeader, acting)
		}
		_, err := svc.ReportBracketResult(ctx, req)
		return err
	}
	if err := report(""); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("bracket report with no acting identity: code = %v, want PermissionDenied", connectErrCode(err))
	}
	if err := report(outsider); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("bracket report by non-creator: code = %v, want PermissionDenied", connectErrCode(err))
	}

	if err := cancel(outsider); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("cancel by non-creator: code = %v, want PermissionDenied", connectErrCode(err))
	}
	if err := cancel(creator); err != nil {
		t.Fatalf("cancel by creator: %v", err)
	}
}
