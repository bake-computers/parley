package handlers

import (
	"context"
	"os"
	"strings"

	"connectrpc.com/connect"
	userv1 "github.com/bake-computers/parley/gen/parley/user/v1"
	"github.com/bake-computers/parley/gen/parley/user/v1/userv1connect"
	"github.com/bake-computers/parley/internal/apperr"
	"github.com/bake-computers/parley/internal/services"
)

type UserHandler struct {
	svc        *services.UserSettingsService
	hmacSecret string
}

func NewUserHandler(svc *services.UserSettingsService) *UserHandler {
	return &UserHandler{
		svc:        svc,
		hmacSecret: os.Getenv("ACCOUNT_DELETION_HMAC_SECRET"),
	}
}

func (h *UserHandler) GetUserSettings(
	ctx context.Context,
	req *connect.Request[userv1.GetUserSettingsRequest],
) (*connect.Response[userv1.UserSettingsResponse], error) {
	discordUserID := strings.TrimSpace(req.Msg.GetDiscordUserId())
	if discordUserID == "" {
		return connect.NewResponse(&userv1.UserSettingsResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "discord_user_id is required"),
		}), nil
	}

	settings, err := h.svc.GetUserSettings(ctx, discordUserID)
	if err != nil {
		return nil, apperr.Internal(err.Error())
	}

	return connect.NewResponse(&userv1.UserSettingsResponse{
		Success:  true,
		Settings: settings,
	}), nil
}

func (h *UserHandler) UpsertUserSettings(
	ctx context.Context,
	req *connect.Request[userv1.UpsertUserSettingsRequest],
) (*connect.Response[userv1.UserSettingsResponse], error) {
	s := req.Msg.GetSettings()
	if s == nil {
		return connect.NewResponse(&userv1.UserSettingsResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "settings is required"),
		}), nil
	}
	if strings.TrimSpace(s.GetDiscordUserId()) == "" {
		return connect.NewResponse(&userv1.UserSettingsResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "discord_user_id is required"),
		}), nil
	}

	saved, err := h.svc.UpsertUserSettings(ctx, s)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&userv1.UserSettingsResponse{
		Success:  true,
		Settings: saved,
	}), nil
}

func (h *UserHandler) DeleteUserData(
	ctx context.Context,
	req *connect.Request[userv1.DeleteUserDataRequest],
) (*connect.Response[userv1.DeleteUserDataResponse], error) {
	discordUserID := strings.TrimSpace(req.Msg.GetDiscordUserId())
	if discordUserID == "" {
		return connect.NewResponse(&userv1.DeleteUserDataResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "discord_user_id is required"),
		}), nil
	}

	resp, err := h.svc.DeleteUserData(ctx, discordUserID, h.hmacSecret)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(resp), nil
}

var _ userv1connect.UserSettingsServiceHandler = (*UserHandler)(nil)
