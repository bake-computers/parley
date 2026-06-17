package handlers

import (
	"context"

	"connectrpc.com/connect"
	identityv1 "github.com/pactum-computers/parley/gen/parley/identity/v1"
	"github.com/pactum-computers/parley/gen/parley/identity/v1/identityv1connect"
	"github.com/pactum-computers/parley/internal/services"
)

type IdentityHandler struct {
	identityv1connect.UnimplementedIdentityServiceHandler
	svc *services.IdentityService
}

func NewIdentityHandler(svc *services.IdentityService) *IdentityHandler {
	return &IdentityHandler{svc: svc}
}

var _ identityv1connect.IdentityServiceHandler = (*IdentityHandler)(nil)

func (h *IdentityHandler) LinkAccount(
	ctx context.Context,
	req *connect.Request[identityv1.LinkAccountRequest],
) (*connect.Response[identityv1.LinkAccountResponse], error) {
	resp, err := h.svc.LinkAccount(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *IdentityHandler) UnlinkAccount(
	ctx context.Context,
	req *connect.Request[identityv1.UnlinkAccountRequest],
) (*connect.Response[identityv1.UnlinkAccountResponse], error) {
	resp, err := h.svc.UnlinkAccount(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *IdentityHandler) LookupByDiscord(
	ctx context.Context,
	req *connect.Request[identityv1.LookupByDiscordRequest],
) (*connect.Response[identityv1.LookupByDiscordResponse], error) {
	resp, err := h.svc.LookupByDiscord(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}

func (h *IdentityHandler) LookupByUsername(
	ctx context.Context,
	req *connect.Request[identityv1.LookupByUsernameRequest],
) (*connect.Response[identityv1.LookupByUsernameResponse], error) {
	resp, err := h.svc.LookupByUsername(ctx, req)
	if err != nil {
		return nil, mapErr(err)
	}
	return resp, nil
}
