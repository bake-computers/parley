//go:build integration
// +build integration

// User settings + GDPR deletion integration tests.
//
// Ported from tests/user_settings.rs. The Rust suite tested two
// scenarios directly against the Diesel repos:
//
//  1. delete_anonymizes_and_blocks_relink — links a player, calls
//     anonymize_all, asserts the sentinel starts with "deleted_",
//     identity is gone, player username is "Deleted User", and the
//     cooldown check returns a future timestamp.
//
// The Go port exercises UserSettingsRepo, IdentityRepo, and
// GuildRepo via bun against a testcontainers Postgres. The
// AnonymizePlayer path is already tested over ConnectRPC in
// identity_link_test.go::TestIdentityLink_DeleteAnonymizes — this
// file tests the repo layer directly, mirroring the Rust originals.
package tests

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"connectrpc.com/connect"
	userv1 "github.com/bake-computers/parley/gen/parley/user/v1"
	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
	"github.com/bake-computers/parley/internal/services"
)

// TestUserSettings_DeleteAnonymizesAndBlocksRelink mirrors the Rust
// delete_anonymizes_and_blocks_relink test. It links a player, calls
// AnonymizePlayer, then verifies:
//   - sentinel starts with "deleted_"
//   - DiscordIdentity is gone
//   - Player username is "Deleted User"
//   - Cooldown check returns a future timestamp
func TestUserSettings_DeleteAnonymizesAndBlocksRelink(t *testing.T) {
	bdb, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()
	identityRepo := repos.NewIdentityRepo(bdb)
	guildRepo := repos.NewGuildRepo(bdb)

	hmacSecret := "test-hmac-secret-do-not-use-in-prod"
	discordID := fmt.Sprintf("delete_user_%s", randomSuffix())

	// Create a player and link the Discord identity.
	player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, "TestPlayer", "uplay", nil, nil)
	if err != nil {
		t.Fatalf("UpsertPlayerByIdentity: %v", err)
	}
	if _, err := identityRepo.LinkDiscordIdentity(ctx, models.GameR6, discordID, player.ID); err != nil {
		t.Fatalf("LinkDiscordIdentity: %v", err)
	}

	// Anonymize.
	report, err := identityRepo.AnonymizePlayer(ctx, discordID, hmacSecret)
	if err != nil {
		t.Fatalf("AnonymizePlayer: %v", err)
	}

	// Sentinel starts with "deleted_".
	if !strings.HasPrefix(report.AnonymizedDiscordUserID, "deleted_") {
		t.Errorf("sentinel = %q, want prefix 'deleted_'", report.AnonymizedDiscordUserID)
	}
	if report.DiscordIdentities != 1 {
		t.Errorf("discord_identities = %d, want 1", report.DiscordIdentities)
	}
	if report.Players != 1 {
		t.Errorf("players = %d, want 1", report.Players)
	}

	// Identity should be gone.
	idents, err := identityRepo.FindDiscordIdentities(ctx, nil, discordID)
	if err != nil {
		t.Fatalf("FindDiscordIdentities: %v", err)
	}
	if len(idents) != 0 {
		t.Errorf("identities len = %d, want 0", len(idents))
	}

	// Player should be anonymized.
	refreshed, err := identityRepo.FindPlayer(ctx, player.ID)
	if err != nil {
		t.Fatalf("FindPlayer: %v", err)
	}
	if refreshed == nil {
		t.Fatal("FindPlayer: nil, want row")
	}
	if refreshed.Username != "Deleted User" {
		t.Errorf("player.username = %q, want 'Deleted User'", refreshed.Username)
	}

	// Cooldown check should block re-linking.
	blocked, err := guildRepo.IsDeletionBlocked(ctx, discordID, hmacSecret)
	if err != nil {
		t.Fatalf("IsDeletionBlocked: %v", err)
	}
	if blocked == nil {
		t.Fatal("IsDeletionBlocked: nil, want cooldown timestamp")
	}
	if *blocked <= repos.NowMS() {
		t.Errorf("cooldown_until = %d, want > now (%d)", *blocked, repos.NowMS())
	}
}

// TestUserSettings_OnlyOwnerCanAccess verifies that user settings can
// only be read or written under the verified owner identity — an IDOR
// here let any caller read preferences and flip matchmaking_enabled for
// a victim (F20).
func TestUserSettings_OnlyOwnerCanAccess(t *testing.T) {
	rig := newEngineWithDB(t)
	ctx := context.Background()

	victim := fmt.Sprintf("us_victim_%s", randomSuffix())
	attacker := fmt.Sprintf("us_attacker_%s", randomSuffix())

	get := func(acting, target string) error {
		req := connect.NewRequest(&userv1.GetUserSettingsRequest{DiscordUserId: target})
		if acting != "" {
			req.Header().Set(services.ActingUserIDHeader, acting)
		}
		_, err := rig.UserClient.GetUserSettings(ctx, req)
		return err
	}
	upsert := func(acting, target string) error {
		req := connect.NewRequest(&userv1.UpsertUserSettingsRequest{
			Settings: &userv1.UserSettings{
				DiscordUserId:      target,
				MatchmakingEnabled: false,
			},
		})
		if acting != "" {
			req.Header().Set(services.ActingUserIDHeader, acting)
		}
		_, err := rig.UserClient.UpsertUserSettings(ctx, req)
		return err
	}

	if err := get("", victim); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("get with no acting identity: code = %v, want PermissionDenied (err = %v)", connectErrCode(err), err)
	}
	if err := get(attacker, victim); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("get as another user: code = %v, want PermissionDenied", connectErrCode(err))
	}
	if err := upsert(attacker, victim); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("upsert as another user: code = %v, want PermissionDenied", connectErrCode(err))
	}
	if err := get(victim, victim); err != nil {
		t.Fatalf("get own settings: %v", err)
	}
	if err := upsert(victim, victim); err != nil {
		t.Fatalf("upsert own settings: %v", err)
	}
}
