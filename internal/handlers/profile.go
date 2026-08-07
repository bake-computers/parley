package handlers

import (
	"context"

	"connectrpc.com/connect"
	profilev1 "github.com/bake-computers/parley/gen/parley/profile/v1"
	"github.com/bake-computers/parley/gen/parley/profile/v1/profilev1connect"
	"github.com/bake-computers/parley/internal/services"
)

type ProfileHandler struct {
	profilev1connect.UnimplementedProfileServiceHandler
	svc *services.ProfileService
}

func NewProfileHandler(svc *services.ProfileService) *ProfileHandler {
	return &ProfileHandler{svc: svc}
}

var _ profilev1connect.ProfileServiceHandler = (*ProfileHandler)(nil)

func (h *ProfileHandler) UpsertDiscordProfile(
	ctx context.Context,
	req *connect.Request[profilev1.UpsertDiscordProfileRequest],
) (*connect.Response[profilev1.UpsertDiscordProfileResponse], error) {
	resp, err := h.svc.UpsertDiscordProfile(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *ProfileHandler) GetPublicProfile(
	ctx context.Context,
	req *connect.Request[profilev1.GetPublicProfileRequest],
) (*connect.Response[profilev1.GetPublicProfileResponse], error) {
	resp, err := h.svc.GetPublicProfile(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}
