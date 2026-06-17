package handlers_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/pactum-computers/parley/gen/parley/common/v1"
	guildv1 "github.com/pactum-computers/parley/gen/parley/guild/v1"
	"github.com/pactum-computers/parley/internal/handlers"
	"github.com/pactum-computers/parley/internal/services"
)

func newTestHandler(t *testing.T) *handlers.GuildHandler {
	t.Helper()
	svc := services.NewGuildService(nil)
	return handlers.NewGuildHandler(svc)
}

func TestGetGuildSettings_EmptyGuildID(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.GetGuildSettingsRequest{
		GuildId: "",
		Game:    commonv1.Game_GAME_R6,
	})
	resp, err := h.GetGuildSettings(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestGetGuildSettings_UnspecifiedGame(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.GetGuildSettingsRequest{
		GuildId: "guild-1",
		Game:    commonv1.Game_GAME_UNSPECIFIED,
	})
	_, err := h.GetGuildSettings(context.Background(), req)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUpsertGuildSettings_NilSettings(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.UpsertGuildSettingsRequest{})
	resp, err := h.UpsertGuildSettings(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestUpsertGuildSettings_EmptyGuildID(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.UpsertGuildSettingsRequest{
		Settings: &guildv1.GuildSettings{
			GuildId: "",
			Game:    commonv1.Game_GAME_R6,
		},
	})
	resp, err := h.UpsertGuildSettings(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestGetMatchmakingRules_EmptyGuildID(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.GetMatchmakingRulesRequest{
		GuildId: "",
		Game:    commonv1.Game_GAME_R6,
	})
	resp, err := h.GetMatchmakingRules(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestUpsertMatchmakingRules_NilRules(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.UpsertMatchmakingRulesRequest{})
	resp, err := h.UpsertMatchmakingRules(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestUpsertMatchmakingRules_EmptyGuildID(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.UpsertMatchmakingRulesRequest{
		Rules: &guildv1.GuildMatchmakingRules{
			GuildId: "",
			Game:    commonv1.Game_GAME_R6,
		},
	})
	resp, err := h.UpsertMatchmakingRules(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestGetNotificationSettings_EmptyGuildID(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.GetNotificationSettingsRequest{
		GuildId: "",
		Game:    commonv1.Game_GAME_R6,
	})
	resp, err := h.GetNotificationSettings(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestUpsertNotificationSettings_NilSettings(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.UpsertNotificationSettingsRequest{})
	resp, err := h.UpsertNotificationSettings(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestUpsertNotificationSettings_EmptyGuildID(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.UpsertNotificationSettingsRequest{
		Settings: &guildv1.GuildNotificationSettings{
			GuildId: "",
			Game:    commonv1.Game_GAME_R6,
		},
	})
	resp, err := h.UpsertNotificationSettings(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestGetMatchQuotas_EmptyGuildID(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.GetMatchQuotasRequest{
		GuildId: "",
		Game:    commonv1.Game_GAME_R6,
	})
	resp, err := h.GetMatchQuotas(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestUpsertMatchQuotas_NilQuota(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.UpsertMatchQuotasRequest{})
	resp, err := h.UpsertMatchQuotas(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func TestUpsertMatchQuotas_EmptyGuildID(t *testing.T) {
	h := newTestHandler(t)
	req := connect.NewRequest(&guildv1.UpsertMatchQuotasRequest{
		Quota: &guildv1.GuildMatchQuota{
			GuildId: "",
			Game:    commonv1.Game_GAME_R6,
		},
	})
	resp, err := h.UpsertMatchQuotas(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertNotSuccess(t, resp.Msg.Success, resp.Msg.Error)
}

func assertNotSuccess(t *testing.T, success bool, errPb *commonv1.Error) {
	t.Helper()
	if success {
		t.Fatal("expected failure response")
	}
	if errPb == nil {
		t.Fatal("expected error proto in response")
	}
}

func assertConnectCode(t *testing.T, err error, want connect.Code) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected connect error with code %v, got nil", want)
	}
	cerr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T: %v", err, err)
	}
	if cerr.Code() != want {
		t.Fatalf("connect.Code = %v, want %v", cerr.Code(), want)
	}
}
