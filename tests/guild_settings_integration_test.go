//go:build integration
// +build integration

package tests

import (
	"context"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	guildv1 "github.com/bake-computers/parley/gen/parley/guild/v1"
	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
	"github.com/bake-computers/parley/internal/services"
)

// TestGuildSettings_OnlyMembersCanConfigure verifies that guild
// settings/rules/quota writes require the verified caller to be a member
// of the target guild — not a caller-supplied updated_by field
// (F14/F15).
func TestGuildSettings_OnlyMembersCanConfigure(t *testing.T) {
	rig := newEngineWithDB(t)
	ctx := context.Background()

	guildID := fmt.Sprintf("g_%s", randomSuffix())
	member := fmt.Sprintf("g_member_%s", randomSuffix())
	outsider := fmt.Sprintf("g_outsider_%s", randomSuffix())

	identityRepo := repos.NewIdentityRepo(rig.BunDB)
	guildRepo := repos.NewGuildRepo(rig.BunDB)
	player, err := identityRepo.UpsertPlayerByIdentity(ctx, models.GameR6, "GuildAdmin", "pc", nil, nil)
	if err != nil {
		t.Fatalf("UpsertPlayerByIdentity: %v", err)
	}
	if _, err := guildRepo.UpsertMembership(ctx, models.GameR6, guildID, member, player.ID); err != nil {
		t.Fatalf("UpsertMembership: %v", err)
	}

	upsert := func(acting string) error {
		req := connect.NewRequest(&guildv1.UpsertGuildSettingsRequest{
			Settings: &guildv1.GuildSettings{
				GuildId:                guildID,
				Game:                   commonv1.Game_GAME_R6,
				MatchmakingEnabled:     false,
				UpdatedByDiscordUserId: acting,
			},
		})
		if acting != "" {
			req.Header().Set(services.ActingUserIDHeader, acting)
		}
		_, err := rig.GuildClient.UpsertGuildSettings(ctx, req)
		return err
	}

	// The body-supplied updated_by field grants nothing: an outsider who
	// claims to be the member is still rejected, and so is no identity.
	if err := upsert(""); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("no acting identity: code = %v, want PermissionDenied (err = %v)", connectErrCode(err), err)
	}
	if err := upsert(outsider); connectErrCode(err) != connect.CodePermissionDenied {
		t.Fatalf("non-member: code = %v, want PermissionDenied (err = %v)", connectErrCode(err), err)
	}
	if err := upsert(member); err != nil {
		t.Fatalf("member upsert: %v", err)
	}

	got, err := rig.GuildClient.GetGuildSettings(ctx, connect.NewRequest(&guildv1.GetGuildSettingsRequest{
		GuildId: guildID,
		Game:    commonv1.Game_GAME_R6,
	}))
	if err != nil {
		t.Fatalf("GetGuildSettings: %v", err)
	}
	if got.Msg.GetSettings().GetMatchmakingEnabled() {
		t.Error("MatchmakingEnabled = true, want false (member write should have applied)")
	}
	if got.Msg.GetSettings().GetUpdatedByDiscordUserId() != member {
		t.Errorf("UpdatedByDiscordUserId = %q, want the verified acting user %q",
			got.Msg.GetSettings().GetUpdatedByDiscordUserId(), member)
	}
}
