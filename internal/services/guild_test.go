package services_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/pactum-computers/parley/gen/parley/common/v1"
	guildv1 "github.com/pactum-computers/parley/gen/parley/guild/v1"
	"github.com/pactum-computers/parley/internal/services"
)

func newNilDBService() *services.GuildService {
	return services.NewGuildService(nil)
}

func TestGetGuildSettings_UnspecifiedGame(t *testing.T) {
	svc := newNilDBService()
	_, err := svc.GetGuildSettings(context.Background(), "guild-1", commonv1.Game_GAME_UNSPECIFIED)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestGetMatchmakingRules_UnspecifiedGame(t *testing.T) {
	svc := newNilDBService()
	_, err := svc.GetMatchmakingRules(context.Background(), "guild-1", commonv1.Game_GAME_UNSPECIFIED)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestGetMatchQuota_UnspecifiedGame(t *testing.T) {
	svc := newNilDBService()
	_, err := svc.GetMatchQuota(context.Background(), "guild-1", commonv1.Game_GAME_UNSPECIFIED)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUpsertGuildSettings_NilPayload(t *testing.T) {
	svc := newNilDBService()
	_, err := svc.UpsertGuildSettings(context.Background(), nil)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUpsertMatchmakingRules_NilPayload(t *testing.T) {
	svc := newNilDBService()
	_, err := svc.UpsertMatchmakingRules(context.Background(), nil)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUpsertMatchQuota_NilPayload(t *testing.T) {
	svc := newNilDBService()
	_, err := svc.UpsertMatchQuota(context.Background(), nil)
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUpsertGuildSettings_UnspecifiedGame(t *testing.T) {
	svc := newNilDBService()
	_, err := svc.UpsertGuildSettings(context.Background(), &guildv1.GuildSettings{
		GuildId: "guild-1",
		Game:    commonv1.Game_GAME_UNSPECIFIED,
	})
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUpsertMatchmakingRules_UnspecifiedGame(t *testing.T) {
	svc := newNilDBService()
	_, err := svc.UpsertMatchmakingRules(context.Background(), &guildv1.GuildMatchmakingRules{
		GuildId: "guild-1",
		Game:    commonv1.Game_GAME_UNSPECIFIED,
	})
	assertConnectCode(t, err, connect.CodeInvalidArgument)
}

func TestUpsertMatchQuota_UnspecifiedGame(t *testing.T) {
	svc := newNilDBService()
	_, err := svc.UpsertMatchQuota(context.Background(), &guildv1.GuildMatchQuota{
		GuildId: "guild-1",
		Game:    commonv1.Game_GAME_UNSPECIFIED,
	})
	assertConnectCode(t, err, connect.CodeInvalidArgument)
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
