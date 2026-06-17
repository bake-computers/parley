package services_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/pactum-computers/parley/gen/parley/common/v1"
	identityv1 "github.com/pactum-computers/parley/gen/parley/identity/v1"
	"github.com/pactum-computers/parley/internal/services"
)

func newIdentityService(t *testing.T) *services.IdentityService {
	t.Helper()
	return services.NewIdentityService(nil, nil)
}

func TestLinkAccount_InvalidGame(t *testing.T) {
	svc := newIdentityService(t)
	req := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: "123",
		Game:          commonv1.Game_GAME_UNSPECIFIED,
		Username:      "user",
		Platform:      "uplay",
	})
	_, err := svc.LinkAccount(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestLinkAccount_EmptyFields(t *testing.T) {
	svc := newIdentityService(t)
	tests := []struct {
		name string
		req  *identityv1.LinkAccountRequest
	}{
		{"empty discord_user_id", &identityv1.LinkAccountRequest{Game: commonv1.Game_GAME_R6, Username: "u", Platform: "p"}},
		{"empty username", &identityv1.LinkAccountRequest{DiscordUserId: "123", Game: commonv1.Game_GAME_R6, Platform: "p"}},
		{"empty platform", &identityv1.LinkAccountRequest{DiscordUserId: "123", Game: commonv1.Game_GAME_R6, Username: "u"}},
		{"whitespace-only fields", &identityv1.LinkAccountRequest{DiscordUserId: "  ", Game: commonv1.Game_GAME_R6, Username: "u", Platform: "p"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.LinkAccount(context.Background(), connect.NewRequest(tt.req))
			assertConnectCode(t, err, connect.CodeInvalidArgument)
		})
	}
}

func TestUnlinkAccount_InvalidGame(t *testing.T) {
	svc := newIdentityService(t)
	req := connect.NewRequest(&identityv1.UnlinkAccountRequest{
		DiscordUserId: "123",
		Game:          commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := svc.UnlinkAccount(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUnlinkAccount_EmptyDiscordUserID(t *testing.T) {
	svc := newIdentityService(t)
	req := connect.NewRequest(&identityv1.UnlinkAccountRequest{
		DiscordUserId: "",
		Game:          commonv1.Game_GAME_R6,
	})
	_, err := svc.UnlinkAccount(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestLookupByDiscord_EmptyDiscordUserID(t *testing.T) {
	svc := newIdentityService(t)
	req := connect.NewRequest(&identityv1.LookupByDiscordRequest{
		DiscordUserId: "",
		Game:          commonv1.Game_GAME_R6,
	})
	_, err := svc.LookupByDiscord(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestLookupByUsername_InvalidGame(t *testing.T) {
	svc := newIdentityService(t)
	req := connect.NewRequest(&identityv1.LookupByUsernameRequest{
		Game:     commonv1.Game_GAME_UNSPECIFIED,
		Username: "user",
		Platform: "uplay",
	})
	_, err := svc.LookupByUsername(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestLookupByUsername_EmptyFields(t *testing.T) {
	svc := newIdentityService(t)
	tests := []struct {
		name string
		req  *identityv1.LookupByUsernameRequest
	}{
		{"empty username", &identityv1.LookupByUsernameRequest{Game: commonv1.Game_GAME_R6, Platform: "p"}},
		{"empty platform", &identityv1.LookupByUsernameRequest{Game: commonv1.Game_GAME_R6, Username: "u"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.LookupByUsername(context.Background(), connect.NewRequest(tt.req))
			assertConnectCode(t, err, connect.CodeInvalidArgument)
		})
	}
}
