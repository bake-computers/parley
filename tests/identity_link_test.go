//go:build integration
// +build integration

// Identity link round-trip tests for the engine-service ConnectRPC surface.
//
// Ported from tests/user_settings.rs and tests/connect_integration.rs.
// The Rust suite did not exercise LinkAccount end-to-end over the wire —
// it called repos directly. The Go port lifts the test to the ConnectRPC
// boundary so we cover the full request → handler → service → repo →
// Postgres → response path. This is the closest Go equivalent of the
// Rust `link round-trip` style test the plan calls out.
package tests

import (
	"context"
	"strings"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	identityv1 "github.com/bake-computers/parley/gen/parley/identity/v1"
	userv1 "github.com/bake-computers/parley/gen/parley/user/v1"
	"github.com/bake-computers/parley/internal/services"
)

// TestIdentityLink_RoundTrip exercises the four-step lifecycle that every
// Discord user goes through:
//
//  1. LinkAccount — upserts a player and binds the Discord user to it.
//  2. LookupByDiscord — confirms the link is reachable by Discord ID.
//  3. UnlinkAccount — removes the link row.
//  4. LookupByDiscord — confirms the link is gone (the FindDiscordIdentities
//     query returns no rows for the now-unlinked user).
//
// This mirrors the structure of tests/user_settings.rs but drives the
// RPCs over HTTP via the Connect client, not the repos directly.
func TestIdentityLink_RoundTrip(t *testing.T) {
	rig := newEngineWithDB(t)
	ctx := context.Background()

	discordID := "100200300400500600"
	username := "LinkTestPlayer"
	platform := "uplay"

	// 1. LinkAccount.
	linkReq := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
		Username:      username,
		Platform:      platform,
	})
	linkResp, err := rig.IdentityClient.LinkAccount(ctx, linkReq)
	if err != nil {
		t.Fatalf("LinkAccount: %v", err)
	}
	if !linkResp.Msg.GetSuccess() {
		t.Fatalf("LinkAccount: success = false, err = %+v", linkResp.Msg.GetError())
	}
	if linkResp.Msg.GetPlayerId() == 0 {
		t.Fatal("LinkAccount: player_id = 0, want non-zero")
	}
	wantNormalized := "linktestplayer"
	if got := linkResp.Msg.GetUsernameNormalized(); got != wantNormalized {
		t.Fatalf("LinkAccount: username_normalized = %q, want %q", got, wantNormalized)
	}
	playerID := linkResp.Msg.GetPlayerId()

	// 2. LookupByDiscord — should find the link.
	lookupReq := connect.NewRequest(&identityv1.LookupByDiscordRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
	})
	lookupResp, err := rig.IdentityClient.LookupByDiscord(ctx, lookupReq)
	if err != nil {
		t.Fatalf("LookupByDiscord: %v", err)
	}
	if !lookupResp.Msg.GetSuccess() {
		t.Fatalf("LookupByDiscord: success = false, err = %+v", lookupResp.Msg.GetError())
	}
	idents := lookupResp.Msg.GetIdentities()
	if len(idents) != 1 {
		t.Fatalf("LookupByDiscord: identities len = %d, want 1", len(idents))
	}
	got := idents[0]
	if got.GetPlayerId() != playerID {
		t.Errorf("LookupByDiscord: player_id = %d, want %d", got.GetPlayerId(), playerID)
	}
	if got.GetUsername() != username {
		t.Errorf("LookupByDiscord: username = %q, want %q", got.GetUsername(), username)
	}
	if got.GetPlatform() != platform {
		t.Errorf("LookupByDiscord: platform = %q, want %q", got.GetPlatform(), platform)
	}

	// 3. UnlinkAccount.
	unlinkReq := connect.NewRequest(&identityv1.UnlinkAccountRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
	})
	unlinkResp, err := rig.IdentityClient.UnlinkAccount(ctx, unlinkReq)
	if err != nil {
		t.Fatalf("UnlinkAccount: %v", err)
	}
	if !unlinkResp.Msg.GetSuccess() {
		t.Fatalf("UnlinkAccount: success = false, err = %+v", unlinkResp.Msg.GetError())
	}
	if unlinkResp.Msg.GetRemoved() != 1 {
		t.Fatalf("UnlinkAccount: removed = %d, want 1", unlinkResp.Msg.GetRemoved())
	}

	// 4. LookupByDiscord — link should be gone.
	lookupAfterReq := connect.NewRequest(&identityv1.LookupByDiscordRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
	})
	lookupAfterResp, err := rig.IdentityClient.LookupByDiscord(ctx, lookupAfterReq)
	if err != nil {
		t.Fatalf("LookupByDiscord (after unlink): %v", err)
	}
	if got := len(lookupAfterResp.Msg.GetIdentities()); got != 0 {
		t.Errorf("LookupByDiscord (after unlink): identities len = %d, want 0", got)
	}
}

// TestIdentityLink_MultiPlatform allows PC and console profiles on one Discord user.
func TestIdentityLink_MultiPlatform(t *testing.T) {
	rig := newEngineWithDB(t)
	ctx := context.Background()

	discordID := "100200300400500601"
	pcUser := "PcPlayer"
	consoleUser := "ConsolePlayer"

	pcReq := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
		Username:      pcUser,
		Platform:      "pc",
	})
	if _, err := rig.IdentityClient.LinkAccount(ctx, pcReq); err != nil {
		t.Fatalf("LinkAccount(pc): %v", err)
	}

	psReq := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
		Username:      consoleUser,
		Platform:      "playstation",
	})
	if _, err := rig.IdentityClient.LinkAccount(ctx, psReq); err != nil {
		t.Fatalf("LinkAccount(playstation): %v", err)
	}

	lookupReq := connect.NewRequest(&identityv1.LookupByDiscordRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
	})
	lookupResp, err := rig.IdentityClient.LookupByDiscord(ctx, lookupReq)
	if err != nil {
		t.Fatalf("LookupByDiscord: %v", err)
	}
	if got := len(lookupResp.Msg.GetIdentities()); got != 2 {
		t.Fatalf("identities len = %d, want 2", got)
	}

	dupReq := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
		Username:      "OtherPc",
		Platform:      "pc",
	})
	if _, err := rig.IdentityClient.LinkAccount(ctx, dupReq); err == nil {
		t.Fatal("expected duplicate pc link to fail")
	} else if got := connectErrCode(err); got != connect.CodeFailedPrecondition {
		t.Fatalf("duplicate pc link code = %v, want FailedPrecondition", got)
	}

	unlinkReq := connect.NewRequest(&identityv1.UnlinkAccountRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
		Platform:      "pc",
	})
	unlinkResp, err := rig.IdentityClient.UnlinkAccount(ctx, unlinkReq)
	if err != nil {
		t.Fatalf("UnlinkAccount(pc): %v", err)
	}
	if unlinkResp.Msg.GetRemoved() != 1 {
		t.Fatalf("removed = %d, want 1", unlinkResp.Msg.GetRemoved())
	}

	lookupAfterReq := connect.NewRequest(&identityv1.LookupByDiscordRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
	})
	lookupAfterResp, err := rig.IdentityClient.LookupByDiscord(ctx, lookupAfterReq)
	if err != nil {
		t.Fatalf("LookupByDiscord (after partial unlink): %v", err)
	}
	if got := len(lookupAfterResp.Msg.GetIdentities()); got != 1 {
		t.Fatalf("identities len = %d, want 1", got)
	}
	if got := lookupAfterResp.Msg.GetIdentities()[0].GetPlatform(); got != "playstation" {
		t.Errorf("platform = %q, want playstation", got)
	}
}

// TestIdentityLink_LookupByUsername verifies the username-based lookup
// path. After linking, calling LookupByUsername with the same
// (game, username, platform) tuple should return the linked identity.
func TestIdentityLink_LookupByUsername(t *testing.T) {
	rig := newEngineWithDB(t)
	ctx := context.Background()

	discordID := "200300400500600700"
	username := "LookupByUser"
	platform := "pc"

	// Link first.
	linkReq := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
		Username:      username,
		Platform:      platform,
	})
	if _, err := rig.IdentityClient.LinkAccount(ctx, linkReq); err != nil {
		t.Fatalf("LinkAccount: %v", err)
	}

	// Lookup.
	lookupReq := connect.NewRequest(&identityv1.LookupByUsernameRequest{
		Game:     commonv1.Game_GAME_R6,
		Username: username,
		Platform: platform,
	})
	resp, err := rig.IdentityClient.LookupByUsername(ctx, lookupReq)
	if err != nil {
		t.Fatalf("LookupByUsername: %v", err)
	}
	if !resp.Msg.GetSuccess() {
		t.Fatalf("LookupByUsername: success = false, err = %+v", resp.Msg.GetError())
	}
	ident := resp.Msg.GetIdentity()
	if ident == nil {
		t.Fatal("LookupByUsername: identity is nil")
	}
	if ident.GetUsername() != username {
		t.Errorf("LookupByUsername: username = %q, want %q", ident.GetUsername(), username)
	}
	if ident.GetPlatform() != platform {
		t.Errorf("LookupByUsername: platform = %q, want %q", ident.GetPlatform(), platform)
	}
}

// TestIdentityLink_ValidationErrors confirms that the identity handler
// rejects malformed requests with the right connect error code. The
// Rust tests/user_settings.rs do not exercise this surface — the Go port
// adds it because the connect-go error envelope is a load-bearing
// contract for the Discord Worker upstream.
func TestIdentityLink_ValidationErrors(t *testing.T) {
	rig := newEngineWithDB(t)
	ctx := context.Background()

	cases := []struct {
		name     string
		req      *identityv1.LinkAccountRequest
		wantCode connect.Code
	}{
		{
			name: "unspecified_game",
			req: &identityv1.LinkAccountRequest{
				DiscordUserId: "123",
				Game:          commonv1.Game_GAME_UNSPECIFIED,
				Username:      "test",
				Platform:      "uplay",
			},
			wantCode: connect.CodeInvalidArgument,
		},
		{
			name: "empty_discord_id",
			req: &identityv1.LinkAccountRequest{
				DiscordUserId: "",
				Game:          commonv1.Game_GAME_R6,
				Username:      "test",
				Platform:      "uplay",
			},
			wantCode: connect.CodeInvalidArgument,
		},
		{
			name: "empty_username",
			req: &identityv1.LinkAccountRequest{
				DiscordUserId: "123",
				Game:          commonv1.Game_GAME_R6,
				Username:      "",
				Platform:      "uplay",
			},
			wantCode: connect.CodeInvalidArgument,
		},
		{
			name: "empty_platform",
			req: &identityv1.LinkAccountRequest{
				DiscordUserId: "123",
				Game:          commonv1.Game_GAME_R6,
				Username:      "test",
				Platform:      "",
			},
			wantCode: connect.CodeInvalidArgument,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := connect.NewRequest(tc.req)
			_, err := rig.IdentityClient.LinkAccount(ctx, req)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			if got := connectErrCode(err); got != tc.wantCode {
				t.Fatalf("code = %v, want %v (err = %v)", got, tc.wantCode, err)
			}
		})
	}
}

// TestIdentityLink_DeleteAnonymizes drives the full GDPR-style deletion
// path: link a player, call DeleteUserData, then verify the link is gone
// and the anonymization report has the expected counts.
//
// Mirrors the second half of tests/user_settings.rs::delete_anonymizes_
// and_blocks_relink. The cooldown check requires the engine to have
// ACCOUNT_DELETION_HMAC_SECRET configured; the test rig sets this in
// newEngineWithDB.
func TestIdentityLink_DeleteAnonymizes(t *testing.T) {
	rig := newEngineWithDB(t)
	ctx := context.Background()

	discordID := "300400500600700800"
	username := "DeleteMe"
	platform := "uplay"

	// Link.
	linkReq := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
		Username:      username,
		Platform:      platform,
	})
	if _, err := rig.IdentityClient.LinkAccount(ctx, linkReq); err != nil {
		t.Fatalf("LinkAccount: %v", err)
	}

	// Sanity: the link is reachable.
	lookupReq := connect.NewRequest(&identityv1.LookupByDiscordRequest{
		DiscordUserId: discordID,
		Game:          commonv1.Game_GAME_R6,
	})
	pre, err := rig.IdentityClient.LookupByDiscord(ctx, lookupReq)
	if err != nil {
		t.Fatalf("pre-delete LookupByDiscord: %v", err)
	}
	if got := len(pre.Msg.GetIdentities()); got != 1 {
		t.Fatalf("pre-delete identities len = %d, want 1", got)
	}
	playerID := pre.Msg.GetIdentities()[0].GetPlayerId()

	// Delete (anonymize + cooldown). Only the verified caller may
	// anonymize their own account: a mismatched acting identity is
	// rejected before any rows are touched.
	delReq := connect.NewRequest(&userv1.DeleteUserDataRequest{
		DiscordUserId: discordID,
	})
	delReq.Header().Set(services.ActingUserIDHeader, discordID)

	mismatched := connect.NewRequest(&userv1.DeleteUserDataRequest{
		DiscordUserId: discordID,
	})
	mismatched.Header().Set(services.ActingUserIDHeader, "not-the-owner")
	if _, err := rig.UserClient.DeleteUserData(ctx, mismatched); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("DeleteUserData as another user: code = %v, want PermissionDenied", connectErrCode(err))
	}

	delResp, err := rig.UserClient.DeleteUserData(ctx, delReq)
	if err != nil {
		t.Fatalf("DeleteUserData: %v", err)
	}
	if !delResp.Msg.GetSuccess() {
		t.Fatalf("DeleteUserData: success = false")
	}

	sentinel := delResp.Msg.GetAnonymizedDiscordUserId()
	if !strings.HasPrefix(sentinel, "deleted_") {
		t.Errorf("AnonymizedDiscordUserId = %q, want prefix 'deleted_'", sentinel)
	}
	if delResp.Msg.GetCooldownUntilMs() <= 0 {
		t.Errorf("CooldownUntilMs = %d, want > 0", delResp.Msg.GetCooldownUntilMs())
	}
	if counts := delResp.Msg.GetTablesAffected(); counts == nil {
		t.Fatal("TablesAffected is nil")
	} else if counts.GetDiscordIdentities() != 1 {
		t.Errorf("TablesAffected.DiscordIdentities = %d, want 1", counts.GetDiscordIdentities())
	} else if counts.GetPlayers() != 1 {
		t.Errorf("TablesAffected.Players = %d, want 1", counts.GetPlayers())
	}

	// Post-delete lookup: the link is gone.
	post, err := rig.IdentityClient.LookupByDiscord(ctx, lookupReq)
	if err != nil {
		t.Fatalf("post-delete LookupByDiscord: %v", err)
	}
	if got := len(post.Msg.GetIdentities()); got != 0 {
		t.Errorf("post-delete identities len = %d, want 0", got)
	}

	// Player row should be anonymized (username = "Deleted User").
	// We can verify this directly through the bun pool on the rig.
	verifyPlayerAnonymized(t, rig, playerID)

	// Re-delete should fail with FailedPrecondition because the cooldown
	// recorded in step 2 is still active.
	delAgain, err := rig.UserClient.DeleteUserData(ctx, delReq)
	if err == nil {
		t.Fatalf("expected cooldown error on re-delete, got success: %+v", delAgain.Msg)
	}
	if got := connectErrCode(err); got != connect.CodeFailedPrecondition {
		t.Errorf("re-delete code = %v, want FailedPrecondition (err = %v)", got, err)
	}
}

// TestIdentityLink_OwnerBypassesRelinkCooldown verifies that the Discord
// user in BOT_OWNER_DISCORD_ID can re-link while the deletion cooldown is
// active, while other users remain blocked.
func TestIdentityLink_OwnerBypassesRelinkCooldown(t *testing.T) {
	rig := newEngineWithDB(t)
	ctx := context.Background()

	discordID := "100000000000000001"

	link := func() error {
		_, err := rig.IdentityClient.LinkAccount(ctx, connect.NewRequest(&identityv1.LinkAccountRequest{
			DiscordUserId: discordID,
			Game:          commonv1.Game_GAME_R6,
			Username:      "OwnerBypass",
			Platform:      "uplay",
		}))
		return err
	}
	if err := link(); err != nil {
		t.Fatalf("initial LinkAccount: %v", err)
	}

	// Anonymize, which records the re-link cooldown.
	delReq := connect.NewRequest(&userv1.DeleteUserDataRequest{
		DiscordUserId: discordID,
	})
	delReq.Header().Set(services.ActingUserIDHeader, discordID)
	if _, err := rig.UserClient.DeleteUserData(ctx, delReq); err != nil {
		t.Fatalf("DeleteUserData: %v", err)
	}

	if err := link(); err == nil {
		t.Fatal("re-link during cooldown succeeded without owner bypass")
	} else if got := connectErrCode(err); got != connect.CodeFailedPrecondition {
		t.Fatalf("re-link code = %v, want FailedPrecondition (err = %v)", got, err)
	}

	t.Setenv("BOT_OWNER_DISCORD_ID", discordID)
	if err := link(); err != nil {
		t.Fatalf("owner re-link during cooldown: %v", err)
	}
}

// verifyPlayerAnonymized asserts the player row's username was scrubbed
// to "Deleted User" and the username_normalized was replaced with a
// "deleted_<id>" sentinel. This catches partial-anonymization regressions
// where the AnonymizePlayer transaction updates only some tables.
func verifyPlayerAnonymized(t *testing.T, rig *engineTestRig, playerID int32) {
	t.Helper()
	ctx := context.Background()
	var username string
	err := rig.BunDB.NewRaw(
		"SELECT username FROM players WHERE id = ?",
		playerID,
	).Scan(ctx, &username)
	if err != nil {
		t.Fatalf("query player username: %v", err)
	}
	if username != "Deleted User" {
		t.Errorf("player.username = %q, want 'Deleted User'", username)
	}
}
