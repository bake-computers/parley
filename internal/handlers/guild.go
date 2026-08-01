package handlers

import (
	"context"
	"strings"

	"connectrpc.com/connect"
	guildv1 "github.com/bake-computers/parley/gen/parley/guild/v1"
	"github.com/bake-computers/parley/gen/parley/guild/v1/guildv1connect"
	"github.com/bake-computers/parley/internal/apperr"
	"github.com/bake-computers/parley/internal/services"
)

type GuildHandler struct {
	svc *services.GuildService
}

func NewGuildHandler(svc *services.GuildService) *GuildHandler {
	return &GuildHandler{svc: svc}
}

var _ guildv1connect.GuildSettingsServiceHandler = (*GuildHandler)(nil)

func (h *GuildHandler) GetGuildSettings(
	ctx context.Context,
	req *connect.Request[guildv1.GetGuildSettingsRequest],
) (*connect.Response[guildv1.GuildSettingsResponse], error) {
	msg := req.Msg
	if strings.TrimSpace(msg.GetGuildId()) == "" {
		return connect.NewResponse(&guildv1.GuildSettingsResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "guild_id is required"),
		}), nil
	}

	settings, err := h.svc.GetGuildSettings(ctx, msg.GetGuildId(), msg.GetGame())
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&guildv1.GuildSettingsResponse{
		Success:  true,
		Settings: settings,
	}), nil
}

func (h *GuildHandler) UpsertGuildSettings(
	ctx context.Context,
	req *connect.Request[guildv1.UpsertGuildSettingsRequest],
) (*connect.Response[guildv1.GuildSettingsResponse], error) {
	msg := req.Msg
	if msg.GetSettings() == nil {
		return connect.NewResponse(&guildv1.GuildSettingsResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "settings is required"),
		}), nil
	}
	if strings.TrimSpace(msg.GetSettings().GetGuildId()) == "" {
		return connect.NewResponse(&guildv1.GuildSettingsResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "guild_id is required"),
		}), nil
	}

	saved, err := h.svc.UpsertGuildSettings(ctx, msg.GetSettings(), services.ActingDiscordUserID(req.Header()))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&guildv1.GuildSettingsResponse{
		Success:  true,
		Settings: saved,
	}), nil
}

func (h *GuildHandler) GetMatchmakingRules(
	ctx context.Context,
	req *connect.Request[guildv1.GetMatchmakingRulesRequest],
) (*connect.Response[guildv1.GuildMatchmakingRulesResponse], error) {
	msg := req.Msg
	if strings.TrimSpace(msg.GetGuildId()) == "" {
		return connect.NewResponse(&guildv1.GuildMatchmakingRulesResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "guild_id is required"),
		}), nil
	}

	rules, err := h.svc.GetMatchmakingRules(ctx, msg.GetGuildId(), msg.GetGame())
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&guildv1.GuildMatchmakingRulesResponse{
		Success: true,
		Rules:   rules,
	}), nil
}

func (h *GuildHandler) UpsertMatchmakingRules(
	ctx context.Context,
	req *connect.Request[guildv1.UpsertMatchmakingRulesRequest],
) (*connect.Response[guildv1.GuildMatchmakingRulesResponse], error) {
	msg := req.Msg
	if msg.GetRules() == nil {
		return connect.NewResponse(&guildv1.GuildMatchmakingRulesResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "rules is required"),
		}), nil
	}
	if strings.TrimSpace(msg.GetRules().GetGuildId()) == "" {
		return connect.NewResponse(&guildv1.GuildMatchmakingRulesResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "guild_id is required"),
		}), nil
	}

	saved, err := h.svc.UpsertMatchmakingRules(ctx, msg.GetRules(), services.ActingDiscordUserID(req.Header()))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&guildv1.GuildMatchmakingRulesResponse{
		Success: true,
		Rules:   saved,
	}), nil
}

func (h *GuildHandler) GetMatchQuotas(
	ctx context.Context,
	req *connect.Request[guildv1.GetMatchQuotasRequest],
) (*connect.Response[guildv1.GuildMatchQuotasResponse], error) {
	msg := req.Msg
	if strings.TrimSpace(msg.GetGuildId()) == "" {
		return connect.NewResponse(&guildv1.GuildMatchQuotasResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "guild_id is required"),
		}), nil
	}

	quota, err := h.svc.GetMatchQuota(ctx, msg.GetGuildId(), msg.GetGame())
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&guildv1.GuildMatchQuotasResponse{
		Success: true,
		Quota:   quota,
	}), nil
}

func (h *GuildHandler) UpsertMatchQuotas(
	ctx context.Context,
	req *connect.Request[guildv1.UpsertMatchQuotasRequest],
) (*connect.Response[guildv1.GuildMatchQuotasResponse], error) {
	msg := req.Msg
	if msg.GetQuota() == nil {
		return connect.NewResponse(&guildv1.GuildMatchQuotasResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "quota is required"),
		}), nil
	}
	if strings.TrimSpace(msg.GetQuota().GetGuildId()) == "" {
		return connect.NewResponse(&guildv1.GuildMatchQuotasResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "guild_id is required"),
		}), nil
	}

	saved, err := h.svc.UpsertMatchQuota(ctx, msg.GetQuota(), services.ActingDiscordUserID(req.Header()))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&guildv1.GuildMatchQuotasResponse{
		Success: true,
		Quota:   saved,
	}), nil
}
