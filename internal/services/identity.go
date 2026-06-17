// Package services implements the domain logic for identity RPCs.
// Business logic is ported 1:1 from src/handlers/identity.rs.
package services

import (
	"context"
	"fmt"
	"os"
	"strings"

	"connectrpc.com/connect"
	commonv1 "github.com/pactum-computers/parley/gen/parley/common/v1"
	identityv1 "github.com/pactum-computers/parley/gen/parley/identity/v1"
	"github.com/pactum-computers/parley/internal/models"
	"github.com/pactum-computers/parley/internal/repos"
)

// IdentityService implements the parley.identity.v1.IdentityService business logic.
type IdentityService struct {
	identityRepo *repos.IdentityRepo
	guildRepo    *repos.GuildRepo
}

// NewIdentityService returns a service backed by the given repos.
func NewIdentityService(
	ir *repos.IdentityRepo,
	gr *repos.GuildRepo,
) *IdentityService {
	return &IdentityService{
		identityRepo: ir,
		guildRepo:    gr,
	}
}

// --- helpers ---

// requireR6 converts the proto game enum to a models.Game, returning a
// *connect.Error when the game is not R6 (the only game identity supports).
func requireR6(g commonv1.Game) (models.Game, *connect.Error) {
	db, ok := protoGameToDB(g)
	if !ok || db != models.GameR6 {
		return "", connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("game must be R6"))
	}
	return db, nil
}

func playerModelToLinked(discordUserID string, p models.Player, game models.Game) *identityv1.LinkedIdentity {
	profileID := ""
	if p.ProfileID != nil {
		profileID = *p.ProfileID
	}
	profileURL := ""
	if p.ProfileURL != nil {
		profileURL = *p.ProfileURL
	}
	return &identityv1.LinkedIdentity{
		Game:               dbGameToProto(game),
		DiscordUserId:      discordUserID,
		PlayerId:           p.ID,
		Username:           p.Username,
		UsernameNormalized: p.UsernameNormalized,
		Platform:           p.Platform,
		ProfileId:          profileID,
		ProfileUrl:         profileURL,
		InternalElo:        p.InternalElo,
		InternalMatches:    p.InternalMatches,
		InternalWins:       p.InternalWins,
		InternalLosses:     p.InternalLosses,
	}
}

// --- RPCs ---

// LinkAccount upserts a player by identity, links the Discord user, and
// optionally upserts a guild membership. Mirrors link_account_rpc in Rust.
func (s *IdentityService) LinkAccount(
	ctx context.Context,
	req *connect.Request[identityv1.LinkAccountRequest],
) (*connect.Response[identityv1.LinkAccountResponse], error) {
	msg := req.Msg

	game, cerr := requireR6(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	discordUserID := strings.TrimSpace(msg.GetDiscordUserId())
	username := strings.TrimSpace(msg.GetUsername())
	platform := strings.TrimSpace(msg.GetPlatform())
	if discordUserID == "" || username == "" || platform == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("discord_user_id, username and platform are required"))
	}

	// Deletion cooldown check (mirrors Rust ACCOUNT_DELETION_HMAC_SECRET path).
	if secret := os.Getenv("ACCOUNT_DELETION_HMAC_SECRET"); secret != "" {
		until, err := s.guildRepo.IsDeletionBlocked(ctx, discordUserID, secret)
		if err != nil {
			// Non-fatal: log and continue (mirrors Rust tracing::warn).
			_ = err
		} else if until != nil {
			return nil, connect.NewError(connect.CodeFailedPrecondition,
				fmt.Errorf("account deletion cooldown active until %d ms since epoch", *until))
		}
	}

	player, err := s.identityRepo.UpsertPlayerByIdentity(ctx, game, username, platform, nil, nil)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("upsert player: %w", err))
	}

	if _, err := s.identityRepo.LinkDiscordIdentity(ctx, game, discordUserID, player.ID); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("link discord identity: %w", err))
	}

	// Optional guild membership upsert (non-fatal on failure, mirrors Rust).
	if guildID := strings.TrimSpace(msg.GetGuildId()); guildID != "" {
		if _, err := s.guildRepo.UpsertMembership(ctx, game, guildID, discordUserID, player.ID); err != nil {
			// Non-fatal, mirrors Rust tracing::warn.
			_ = err
		}
	}

	return connect.NewResponse(&identityv1.LinkAccountResponse{
		Success:            true,
		PlayerId:           player.ID,
		UsernameNormalized: player.UsernameNormalized,
	}), nil
}

// UnlinkAccount removes the Discord↔player link. Mirrors unlink_account_rpc in Rust.
func (s *IdentityService) UnlinkAccount(
	ctx context.Context,
	req *connect.Request[identityv1.UnlinkAccountRequest],
) (*connect.Response[identityv1.UnlinkAccountResponse], error) {
	msg := req.Msg

	game, cerr := requireR6(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	discordUserID := strings.TrimSpace(msg.GetDiscordUserId())
	if discordUserID == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("discord_user_id is required"))
	}

	removed, err := s.identityRepo.UnlinkDiscordIdentity(ctx, game, discordUserID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("unlink: %w", err))
	}

	return connect.NewResponse(&identityv1.UnlinkAccountResponse{
		Success: true,
		Removed: int32(removed),
	}), nil
}

// LookupByDiscord returns all linked identities for a Discord user.
// game == GAME_UNSPECIFIED means "return identities for every game".
// Mirrors lookup_by_discord_rpc in Rust.
func (s *IdentityService) LookupByDiscord(
	ctx context.Context,
	req *connect.Request[identityv1.LookupByDiscordRequest],
) (*connect.Response[identityv1.LookupByDiscordResponse], error) {
	msg := req.Msg

	discordUserID := strings.TrimSpace(msg.GetDiscordUserId())
	if discordUserID == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("discord_user_id is required"))
	}

	// GAME_UNSPECIFIED => nil filter (return all games).
	var gameFilter *models.Game
	if g, ok := protoGameToDB(msg.GetGame()); ok {
		gameFilter = &g
	}

	idents, err := s.identityRepo.FindDiscordIdentities(ctx, gameFilter, discordUserID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("lookup: %w", err))
	}

	out := make([]*identityv1.LinkedIdentity, 0, len(idents))
	for _, id := range idents {
		player, err := s.identityRepo.FindPlayer(ctx, id.PlayerID)
		if err != nil || player == nil {
			continue
		}
		out = append(out, playerModelToLinked(id.DiscordUserID, *player, id.Game))
	}

	return connect.NewResponse(&identityv1.LookupByDiscordResponse{
		Success:    true,
		Identities: out,
	}), nil
}

// LookupByUsername finds a player by (game, username, platform) and returns
// the linked identity if present. Mirrors lookup_by_username_rpc in Rust.
func (s *IdentityService) LookupByUsername(
	ctx context.Context,
	req *connect.Request[identityv1.LookupByUsernameRequest],
) (*connect.Response[identityv1.LookupByUsernameResponse], error) {
	msg := req.Msg

	game, cerr := requireR6(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	username := strings.TrimSpace(msg.GetUsername())
	platform := strings.TrimSpace(msg.GetPlatform())
	if username == "" || platform == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("username and platform are required"))
	}

	player, err := s.identityRepo.FindPlayerByIdentity(ctx, game, username, platform)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("lookup: %w", err))
	}

	var identity *identityv1.LinkedIdentity
	if player != nil {
		// Discord side may or may not be linked; pull the first match.
		discordUserID := ""
		idents, err := s.identityRepo.FindDiscordIdentities(ctx, &game, "")
		if err == nil && len(idents) > 0 {
			discordUserID = idents[0].DiscordUserID
		}
		identity = playerModelToLinked(discordUserID, *player, game)
	}

	return connect.NewResponse(&identityv1.LookupByUsernameResponse{
		Success:  true,
		Identity: identity,
	}), nil
}
