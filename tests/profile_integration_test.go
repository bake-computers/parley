//go:build integration
// +build integration

// Public profile integration tests — Discord handle cache, privacy, redirects,
// rating history, and GDPR scrub of web-only profiles.
package tests

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	profilev1 "github.com/bake-computers/parley/gen/parley/profile/v1"
	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
	"github.com/bake-computers/parley/internal/services"
)

func newProfileStack(t *testing.T) (
	profileSvc *services.ProfileService,
	profileRepo *repos.ProfileRepo,
	identityRepo *repos.IdentityRepo,
	guildRepo *repos.GuildRepo,
	userRepo *repos.UserSettingsRepo,
	matchRepo *repos.MatchRepo,
	cleanup func(),
) {
	t.Helper()
	bdb, cleanup := newTestBunDB(t)
	identityRepo = repos.NewIdentityRepo(bdb)
	guildRepo = repos.NewGuildRepo(bdb)
	userRepo = repos.NewUserSettingsRepo(bdb)
	matchRepo = repos.NewMatchRepo(bdb)
	profileRepo = repos.NewProfileRepo(bdb)
	profileSvc = services.NewProfileService(profileRepo, userRepo, identityRepo, matchRepo)
	return profileSvc, profileRepo, identityRepo, guildRepo, userRepo, matchRepo, cleanup
}

func TestProfile_UpsertParkReclaimAndPublicResolve(t *testing.T) {
	svc, repo, _, _, _, _, cleanup := newProfileStack(t)
	defer cleanup()
	ctx := context.Background()

	userA := fmt.Sprintf("user_a_%s", randomSuffix())
	userB := fmt.Sprintf("user_b_%s", randomSuffix())
	handle := fmt.Sprintf("handle_%s", randomSuffix())

	if err := repo.UpsertDiscordProfile(ctx, userA, handle, "Alice", "aaa"); err != nil {
		t.Fatalf("upsert A: %v", err)
	}
	// B claims the same handle (last-writer-wins).
	if err := repo.UpsertDiscordProfile(ctx, userB, handle, "Bob", "bbb"); err != nil {
		t.Fatalf("upsert B: %v", err)
	}

	got, err := repo.FindDiscordProfileByUsername(ctx, handle)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if got == nil || got.DiscordUserID != userB {
		t.Fatalf("holder = %+v, want B", got)
	}

	// A is parked — not publicly resolvable by synthetic name.
	parked, err := repo.FindDiscordProfileByUsername(ctx, "parked_"+userA)
	if err != nil {
		t.Fatalf("find parked: %v", err)
	}
	if parked != nil {
		t.Fatalf("parked handle must not resolve publicly: %+v", parked)
	}

	// Live public profile is B.
	resp, err := svc.GetPublicProfile(ctx, connect.NewRequest(&profilev1.GetPublicProfileRequest{
		Username: handle,
		Game:     commonv1.Game_GAME_R6,
	}))
	if err != nil {
		t.Fatalf("GetPublicProfile: %v", err)
	}
	if !resp.Msg.Found || resp.Msg.Profile == nil || resp.Msg.Profile.DiscordUserId != userB {
		t.Fatalf("live handle response = %+v", resp.Msg)
	}

	// A recovers a new real handle; old handle still belongs to B.
	newHandle := fmt.Sprintf("new_%s", randomSuffix())
	if err := repo.UpsertDiscordProfile(ctx, userA, newHandle, "Alice", "aaa"); err != nil {
		t.Fatalf("upsert A new: %v", err)
	}
	aProf, err := repo.FindDiscordProfileByUsername(ctx, newHandle)
	if err != nil || aProf == nil || aProf.DiscordUserID != userA {
		t.Fatalf("A new handle = %+v err=%v", aProf, err)
	}
}

func TestProfile_PrivateSoftPage(t *testing.T) {
	svc, repo, _, _, userRepo, _, cleanup := newProfileStack(t)
	defer cleanup()
	ctx := context.Background()

	userID := fmt.Sprintf("priv_%s", randomSuffix())
	handle := fmt.Sprintf("privh_%s", randomSuffix())
	if err := repo.UpsertDiscordProfile(ctx, userID, handle, "Hidden", "hhh"); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if _, err := userRepo.Upsert(ctx, &models.NewUserSettings{
		DiscordUserID:      userID,
		CreatedAt:          repos.NowMS(),
		UpdatedAt:          repos.NowMS(),
		MatchmakingEnabled: true,
		ProfilePublic:      false,
	}); err != nil {
		t.Fatalf("settings: %v", err)
	}

	resp, err := svc.GetPublicProfile(ctx, connect.NewRequest(&profilev1.GetPublicProfileRequest{
		Username: handle,
		Game:     commonv1.Game_GAME_R6,
	}))
	if err != nil {
		t.Fatalf("GetPublicProfile: %v", err)
	}
	if !resp.Msg.Found || !resp.Msg.IsPrivate {
		t.Fatalf("want private profile, got %+v", resp.Msg)
	}
	if resp.Msg.Profile == nil || resp.Msg.Profile.Username != handle {
		t.Fatalf("profile = %+v", resp.Msg.Profile)
	}
	if len(resp.Msg.Profile.RecentMatches) != 0 || len(resp.Msg.Profile.RatingHistory) != 0 {
		t.Fatalf("private profile leaked competitive data: %+v", resp.Msg.Profile)
	}
}

func TestProfile_AnonymizeWebOnlyUser(t *testing.T) {
	_, repo, identityRepo, _, _, _, cleanup := newProfileStack(t)
	defer cleanup()
	ctx := context.Background()

	userID := fmt.Sprintf("webonly_%s", randomSuffix())
	handle := fmt.Sprintf("webh_%s", randomSuffix())
	if err := repo.UpsertDiscordProfile(ctx, userID, handle, "WebOnly", "www"); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	report, err := identityRepo.AnonymizePlayer(ctx, userID, "test-hmac-secret")
	if err != nil {
		t.Fatalf("AnonymizePlayer: %v", err)
	}
	if report.AnonymizedDiscordUserID == "" {
		t.Fatal("expected non-empty sentinel for web-only profile scrub")
	}
	if !strings.HasPrefix(report.AnonymizedDiscordUserID, "deleted_") {
		t.Fatalf("sentinel = %q", report.AnonymizedDiscordUserID)
	}

	got, err := repo.FindDiscordProfileByUsername(ctx, handle)
	if err != nil {
		t.Fatalf("find after delete: %v", err)
	}
	if got != nil {
		t.Fatalf("profile still resolvable after GDPR: %+v", got)
	}
}

func TestProfile_RatingHistoryOnMatchUpdate(t *testing.T) {
	_, profileRepo, identityRepo, guildRepo, _, matchRepo, cleanup := newProfileStack(t)
	defer cleanup()
	ctx := context.Background()

	userID := fmt.Sprintf("rated_%s", randomSuffix())
	guildID := fmt.Sprintf("g_%s", randomSuffix())
	handle := fmt.Sprintf("rh_%s", randomSuffix())

	if err := profileRepo.UpsertDiscordProfile(ctx, userID, handle, "Rater", ""); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, "RaterR6_"+randomSuffix(), "pc", nil, nil)
	if err != nil {
		t.Fatalf("player: %v", err)
	}
	if _, err := identityRepo.LinkDiscordIdentity(ctx, models.GameR6, userID, player.ID); err != nil {
		t.Fatalf("link: %v", err)
	}
	if _, err := guildRepo.UpsertMembership(ctx, models.GameR6, guildID, userID, player.ID); err != nil {
		t.Fatalf("membership: %v", err)
	}

	now := repos.NowMS()
	saved, _, err := matchRepo.Create(ctx, &models.NewMatch{
		Game:                   models.GameR6,
		GuildID:                guildID,
		ChannelID:              "ch",
		MessageID:              "msg",
		CreatedByDiscordUserID: userID,
		Status:                 repos.MatchStatusActive,
		MatchType:              "internal",
		ResolutionType:         "played",
		CreatedAt:              now,
		UpdatedAt:              now,
	}, []models.NewMatchParticipant{{
		Game:          models.GameR6,
		DiscordUserID: userID,
		PlayerID:      player.ID,
		Team:          "a",
		Slot:          0,
		CreatedAt:     now,
		UpdatedAt:     now,
	}})
	if err != nil {
		t.Fatalf("create match: %v", err)
	}
	matchID := saved.ID
	if err := guildRepo.UpdateMembershipRating(ctx, models.GameR6, guildID, userID, 1550, 320, true, &matchID); err != nil {
		t.Fatalf("UpdateMembershipRating: %v", err)
	}

	history, err := profileRepo.ListRatingHistory(ctx, models.GameR6, userID, 10)
	if err != nil {
		t.Fatalf("ListRatingHistory: %v", err)
	}
	if len(history) == 0 {
		t.Fatal("expected rating_history row after match rating update")
	}
	last := history[len(history)-1]
	if last.Elo != 1550 {
		t.Fatalf("elo = %v, want 1550", last.Elo)
	}
	if last.Source != models.RatingHistorySourceMatch {
		t.Fatalf("source = %q", last.Source)
	}
}

// TestProfile_CareerRecordFromCompletedMatches ensures public profile W/L is
// derived from completed match outcomes, not only denormalized player counters
// (which stay 0 when ReportMatchResult skips rating updates).
func TestProfile_CareerRecordFromCompletedMatches(t *testing.T) {
	svc, profileRepo, identityRepo, _, userRepo, matchRepo, cleanup := newProfileStack(t)
	defer cleanup()
	ctx := context.Background()

	userID := fmt.Sprintf("career_%s", randomSuffix())
	handle := fmt.Sprintf("career_%s", randomSuffix())
	if err := profileRepo.UpsertDiscordProfile(ctx, userID, handle, "Career", ""); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if _, err := userRepo.Upsert(ctx, &models.NewUserSettings{
		DiscordUserID:      userID,
		MatchmakingEnabled: true,
		ProfilePublic:      true,
		CreatedAt:          repos.NowMS(),
		UpdatedAt:          repos.NowMS(),
	}); err != nil {
		t.Fatalf("settings: %v", err)
	}

	player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, "CareerR6_"+randomSuffix(), "pc", nil, nil)
	if err != nil {
		t.Fatalf("player: %v", err)
	}
	if _, err := identityRepo.LinkDiscordIdentity(ctx, models.GameR6, userID, player.ID); err != nil {
		t.Fatalf("link: %v", err)
	}

	// Leave players.internal_* at zeros — simulate skipped rating update.
	if player.InternalWins != 0 || player.InternalMatches != 0 {
		t.Fatalf("fixture player counters not zero: %+v", player)
	}

	now := repos.NowMS()
	mk := func(team, winning string, kills, deaths, assists int32) {
		t.Helper()
		k, d, a := kills, deaths, assists
		saved, _, err := matchRepo.Create(ctx, &models.NewMatch{
			Game:                   models.GameR6,
			GuildID:                "g_career",
			ChannelID:              "ch",
			MessageID:              fmt.Sprintf("msg_%s", randomSuffix()),
			CreatedByDiscordUserID: userID,
			Status:                 repos.MatchStatusActive,
			MatchType:              "internal",
			ResolutionType:         "played",
			CreatedAt:              now,
			UpdatedAt:              now,
		}, []models.NewMatchParticipant{{
			Game:          models.GameR6,
			DiscordUserID: userID,
			PlayerID:      player.ID,
			Team:          team,
			Slot:          0,
			Kills:         &k,
			Deaths:        &d,
			Assists:       &a,
			CreatedAt:     now,
			UpdatedAt:     now,
		}})
		if err != nil {
			t.Fatalf("create match: %v", err)
		}
		if _, err := matchRepo.Complete(ctx, models.GameR6, saved.ID, winning); err != nil {
			t.Fatalf("complete: %v", err)
		}
	}
	mk("a", "a", 5, 2, 1) // win
	mk("b", "a", 1, 4, 0) // loss
	mk("a", "a", 3, 3, 2) // win

	resp, err := svc.GetPublicProfile(ctx, connect.NewRequest(&profilev1.GetPublicProfileRequest{
		Username:           handle,
		Game:               commonv1.Game_GAME_R6,
		RecentMatchLimit:   10,
		RatingHistoryLimit: 10,
	}))
	if err != nil {
		t.Fatalf("GetPublicProfile: %v", err)
	}
	p := resp.Msg.GetProfile()
	if p == nil {
		t.Fatal("expected profile")
	}
	if p.Matches != 3 || p.Wins != 2 || p.Losses != 1 {
		t.Fatalf("record = %dM %dW %dL, want 3M 2W 1L", p.Matches, p.Wins, p.Losses)
	}
	if p.Kills != 9 || p.Deaths != 9 || p.Assists != 3 {
		t.Fatalf("kda = %d/%d/%d, want 9/9/3", p.Kills, p.Deaths, p.Assists)
	}
	if len(p.RecentMatches) != 3 {
		t.Fatalf("recent matches = %d, want 3", len(p.RecentMatches))
	}
	if len(p.Identities) != 1 {
		t.Fatalf("identities = %d, want 1", len(p.Identities))
	}
	id := p.Identities[0]
	if id.Matches != 3 || id.Wins != 2 || id.Losses != 1 {
		t.Fatalf("identity record = %dM %dW %dL, want 3M 2W 1L", id.Matches, id.Wins, id.Losses)
	}
}

func TestProfile_CanonicalCasingRedirect(t *testing.T) {
	svc, repo, _, _, _, _, cleanup := newProfileStack(t)
	defer cleanup()
	ctx := context.Background()

	userID := fmt.Sprintf("case_%s", randomSuffix())
	// Store with specific casing.
	if err := repo.UpsertDiscordProfile(ctx, userID, "CaseUser", "Case", ""); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	resp, err := svc.GetPublicProfile(ctx, connect.NewRequest(&profilev1.GetPublicProfileRequest{
		Username: "caseuser",
		Game:     commonv1.Game_GAME_R6,
	}))
	if err != nil {
		t.Fatalf("GetPublicProfile: %v", err)
	}
	if !resp.Msg.Found || resp.Msg.RedirectUsername != "CaseUser" {
		t.Fatalf("want redirect to CaseUser, got %+v", resp.Msg)
	}
}
