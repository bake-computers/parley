package handlers_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/pactum-computers/parley/gen/parley/common/v1"
	identityv1 "github.com/pactum-computers/parley/gen/parley/identity/v1"
	"github.com/pactum-computers/parley/internal/handlers"
	"github.com/pactum-computers/parley/internal/services"
)

func newIdentityHandler(t *testing.T) *handlers.IdentityHandler {
	t.Helper()
	svc := services.NewIdentityService(nil, nil)
	return handlers.NewIdentityHandler(svc)
}

func assertConnectError(t *testing.T, err error, wantCode connect.Code) {
	t.Helper()
	if err == nil {
		t.Fatal("expected connect error, got nil")
	}
	cerr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if cerr.Code() != wantCode {
		t.Fatalf("error code = %v, want %v", cerr.Code(), wantCode)
	}
}

func TestLinkAccount_UnspecifiedGame(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: "123",
		Game:          commonv1.Game_GAME_UNSPECIFIED,
		Username:      "test",
		Platform:      "uplay",
	})
	_, err := h.LinkAccount(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}

func TestLinkAccount_EmptyDiscordUserID(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: "",
		Game:          commonv1.Game_GAME_R6,
		Username:      "test",
		Platform:      "uplay",
	})
	_, err := h.LinkAccount(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}

func TestLinkAccount_EmptyUsername(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: "123",
		Game:          commonv1.Game_GAME_R6,
		Username:      "",
		Platform:      "uplay",
	})
	_, err := h.LinkAccount(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}

func TestLinkAccount_EmptyPlatform(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.LinkAccountRequest{
		DiscordUserId: "123",
		Game:          commonv1.Game_GAME_R6,
		Username:      "test",
		Platform:      "",
	})
	_, err := h.LinkAccount(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}

func TestUnlinkAccount_UnspecifiedGame(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.UnlinkAccountRequest{
		DiscordUserId: "123",
		Game:          commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := h.UnlinkAccount(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}

func TestUnlinkAccount_EmptyDiscordUserID(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.UnlinkAccountRequest{
		DiscordUserId: "",
		Game:          commonv1.Game_GAME_R6,
	})
	_, err := h.UnlinkAccount(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}

func TestLookupByDiscord_EmptyDiscordUserID(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.LookupByDiscordRequest{
		DiscordUserId: "",
		Game:          commonv1.Game_GAME_R6,
	})
	_, err := h.LookupByDiscord(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}

func TestLookupByUsername_UnspecifiedGame(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.LookupByUsernameRequest{
		Game:     commonv1.Game_GAME_UNSPECIFIED,
		Username: "test",
		Platform: "uplay",
	})
	_, err := h.LookupByUsername(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}

func TestLookupByUsername_EmptyUsername(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.LookupByUsernameRequest{
		Game:     commonv1.Game_GAME_R6,
		Username: "",
		Platform: "uplay",
	})
	_, err := h.LookupByUsername(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}

func TestLookupByUsername_EmptyPlatform(t *testing.T) {
	h := newIdentityHandler(t)
	req := connect.NewRequest(&identityv1.LookupByUsernameRequest{
		Game:     commonv1.Game_GAME_R6,
		Username: "test",
		Platform: "",
	})
	_, err := h.LookupByUsername(context.Background(), req)
	assertConnectError(t, err, connect.CodeInvalidArgument)
}
