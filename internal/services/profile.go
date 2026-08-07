package services

import (
	"context"
	"fmt"
	"strings"

	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	profilev1 "github.com/bake-computers/parley/gen/parley/profile/v1"
	"github.com/bake-computers/parley/internal/apperr"
	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
)

// ProfileService serves public profiles and Discord identity cache RPCs.
type ProfileService struct {
	profiles *repos.ProfileRepo
	users    *repos.UserSettingsRepo
	ident    *repos.IdentityRepo
	match    *repos.MatchRepo
}

// NewProfileService returns a profile service.
func NewProfileService(
	profiles *repos.ProfileRepo,
	users *repos.UserSettingsRepo,
	ident *repos.IdentityRepo,
	match *repos.MatchRepo,
) *ProfileService {
	return &ProfileService{
		profiles: profiles,
		users:    users,
		ident:    ident,
		match:    match,
	}
}

// UpsertDiscordProfile caches Discord username/avatar after OAuth.
func (s *ProfileService) UpsertDiscordProfile(
	ctx context.Context,
	req *connect.Request[profilev1.UpsertDiscordProfileRequest],
) (*connect.Response[profilev1.UpsertDiscordProfileResponse], error) {
	msg := req.Msg
	discordUserID := strings.TrimSpace(msg.GetDiscordUserId())
	username := strings.TrimSpace(msg.GetUsername())
	if discordUserID == "" || username == "" {
		return nil, apperr.InvalidArgument("discord_user_id and username are required")
	}
	if err := s.profiles.UpsertDiscordProfile(
		ctx,
		discordUserID,
		username,
		msg.GetGlobalName(),
		msg.GetAvatarHash(),
	); err != nil {
		return nil, apperr.Internal(fmt.Sprintf("upsert discord profile: %v", err))
	}
	return connect.NewResponse(&profilev1.UpsertDiscordProfileResponse{Success: true}), nil
}

// GetPublicProfile resolves parley.bot/@{username}.
func (s *ProfileService) GetPublicProfile(
	ctx context.Context,
	req *connect.Request[profilev1.GetPublicProfileRequest],
) (*connect.Response[profilev1.GetPublicProfileResponse], error) {
	msg := req.Msg
	username := strings.TrimSpace(msg.GetUsername())
	if username == "" {
		return nil, apperr.InvalidArgument("username is required")
	}
	game := models.GameR6
	if msg.GetGame() != commonv1.Game_GAME_UNSPECIFIED {
		g, err := protoGameToModel(msg.GetGame())
		if err != nil {
			return nil, apperr.InvalidArgument(err.Error())
		}
		game = g
	}

	matchLimit := int(msg.GetRecentMatchLimit())
	if matchLimit <= 0 {
		matchLimit = 10
	}
	if matchLimit > 50 {
		matchLimit = 50
	}
	historyLimit := int(msg.GetRatingHistoryLimit())
	if historyLimit <= 0 {
		historyLimit = 100
	}
	if historyLimit > 500 {
		historyLimit = 500
	}

	profile, err := s.profiles.FindDiscordProfileByUsername(ctx, username)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("find profile: %v", err))
	}

	if profile == nil {
		// Stale handle → redirect to current username of last owner.
		ownerID, herr := s.profiles.FindLatestUsernameHistoryOwner(ctx, username)
		if herr != nil {
			return nil, apperr.Internal(fmt.Sprintf("username history: %v", herr))
		}
		if ownerID == "" {
			return connect.NewResponse(&profilev1.GetPublicProfileResponse{Found: false}), nil
		}
		current, cerr := s.profiles.FindDiscordProfile(ctx, ownerID)
		if cerr != nil {
			return nil, apperr.Internal(fmt.Sprintf("find current profile: %v", cerr))
		}
		// Parked synthetic handles are not public destinations.
		if current == nil || repos.IsParkedDiscordUsername(current.Username) {
			return connect.NewResponse(&profilev1.GetPublicProfileResponse{Found: false}), nil
		}
		return connect.NewResponse(&profilev1.GetPublicProfileResponse{
			Found:            true,
			RedirectUsername: current.Username,
		}), nil
	}

	// Canonical casing for the public URL (Discord usernames are case-insensitive).
	reqUser := strings.TrimPrefix(strings.TrimSpace(username), "@")
	if reqUser != profile.Username {
		return connect.NewResponse(&profilev1.GetPublicProfileResponse{
			Found:            true,
			RedirectUsername: profile.Username,
		}), nil
	}

	settings, err := s.users.Get(ctx, profile.DiscordUserID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("user settings: %v", err))
	}
	public := true
	if settings != nil {
		public = settings.ProfilePublic
	}

	globalName := ""
	if profile.GlobalName != nil {
		globalName = *profile.GlobalName
	}
	avatarHash := ""
	if profile.AvatarHash != nil {
		avatarHash = *profile.AvatarHash
	}

	if !public {
		return connect.NewResponse(&profilev1.GetPublicProfileResponse{
			Found:     true,
			IsPrivate: true,
			Profile: &profilev1.PublicProfile{
				DiscordUserId: profile.DiscordUserID,
				Username:      profile.Username,
				GlobalName:    globalName,
				AvatarHash:    avatarHash,
			},
		}), nil
	}

	full, err := s.buildPublicProfile(ctx, game, profile, matchLimit, historyLimit)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&profilev1.GetPublicProfileResponse{
		Found:   true,
		Profile: full,
	}), nil
}

func (s *ProfileService) buildPublicProfile(
	ctx context.Context,
	game models.Game,
	profile *models.DiscordProfile,
	matchLimit, historyLimit int,
) (*profilev1.PublicProfile, error) {
	globalName := ""
	if profile.GlobalName != nil {
		globalName = *profile.GlobalName
	}
	avatarHash := ""
	if profile.AvatarHash != nil {
		avatarHash = *profile.AvatarHash
	}

	identities, err := s.ident.FindDiscordIdentities(ctx, &game, profile.DiscordUserID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("identities: %v", err))
	}

	out := &profilev1.PublicProfile{
		DiscordUserId: profile.DiscordUserID,
		Username:      profile.Username,
		GlobalName:    globalName,
		AvatarHash:    avatarHash,
		MemberSinceMs: profile.CreatedAt,
	}

	playerIDs := make([]int32, 0, len(identities))
	for _, id := range identities {
		playerIDs = append(playerIDs, id.PlayerID)
	}
	playersByID, err := s.ident.FindPlayersByIDs(ctx, playerIDs)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("players: %v", err))
	}

	// Prefer player-row career totals (canonical Parley rank display).
	var bestElo float64
	var totalMatches, totalWins, totalLosses int32
	var earliest int64 = profile.CreatedAt
	for _, id := range identities {
		player, ok := playersByID[id.PlayerID]
		if !ok {
			continue
		}
		out.Identities = append(out.Identities, &profilev1.ProfileGameIdentity{
			Username:    player.Username,
			Platform:    player.Platform,
			InternalElo: player.InternalElo,
			Matches:     player.InternalMatches,
			Wins:        player.InternalWins,
			Losses:      player.InternalLosses,
		})
		if player.InternalElo > bestElo {
			bestElo = player.InternalElo
		}
		totalMatches += player.InternalMatches
		totalWins += player.InternalWins
		totalLosses += player.InternalLosses
		if player.CreatedAt > 0 && (earliest == 0 || player.CreatedAt < earliest) {
			earliest = player.CreatedAt
		}
	}
	if bestElo == 0 && len(out.Identities) > 0 {
		bestElo = out.Identities[0].InternalElo
	}
	out.InternalElo = bestElo
	out.Matches = totalMatches
	out.Wins = totalWins
	out.Losses = totalLosses
	if earliest > 0 {
		out.MemberSinceMs = earliest
	}

	career, err := s.profiles.CareerStatsFromMatches(ctx, game, profile.DiscordUserID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("career stats: %v", err))
	}
	if career != nil {
		out.Kills = int32(career.Kills)
		out.Deaths = int32(career.Deaths)
		out.Assists = int32(career.Assists)
	}

	history, err := s.profiles.ListRatingHistory(ctx, game, profile.DiscordUserID, historyLimit)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("rating history: %v", err))
	}
	for _, h := range history {
		pt := &profilev1.RatingPoint{
			RecordedAtMs: h.RecordedAt,
			Elo:          h.Elo,
			Source:       h.Source,
		}
		if h.Delta != nil {
			pt.Delta = h.Delta
		}
		out.RatingHistory = append(out.RatingHistory, pt)
	}

	// Seed a single current point when history is empty so the chart still renders.
	if len(out.RatingHistory) == 0 && bestElo > 0 {
		out.RatingHistory = append(out.RatingHistory, &profilev1.RatingPoint{
			RecordedAtMs: repos.NowMS(),
			Elo:          bestElo,
			Source:       "current",
		})
	}

	matches, err := s.match.ListForUser(ctx, game, profile.DiscordUserID, int64(matchLimit), nil)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("list matches: %v", err))
	}

	// Collect opponent discord ids across matches for profile lookups + privacy.
	allIDs := make([]string, 0, 32)
	type loadedMatch struct {
		row   models.MatchRow
		parts []models.MatchParticipantWithUsername
	}
	loaded := make([]loadedMatch, 0, len(matches))
	for i := range matches {
		// Only completed matches on the public profile.
		if matches[i].Status != "completed" {
			continue
		}
		parts, perr := s.match.Participants(ctx, matches[i].ID)
		if perr != nil {
			return nil, apperr.Internal(fmt.Sprintf("participants: %v", perr))
		}
		for _, p := range parts {
			allIDs = append(allIDs, p.DiscordUserID)
		}
		loaded = append(loaded, loadedMatch{row: matches[i], parts: parts})
	}

	discordProfiles, err := s.profiles.ListDiscordProfilesByIDs(ctx, uniqueStrings(allIDs))
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("opponent profiles: %v", err))
	}
	privacy, err := s.profilePublicMap(ctx, uniqueStrings(allIDs))
	if err != nil {
		return nil, err
	}

	for _, m := range loaded {
		pm := profileMatchToProto(profile.DiscordUserID, &m.row, m.parts, discordProfiles, privacy)
		if pm != nil {
			out.RecentMatches = append(out.RecentMatches, pm)
		}
	}

	return out, nil
}

func (s *ProfileService) profilePublicMap(
	ctx context.Context,
	ids []string,
) (map[string]bool, error) {
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		out[id] = true // default public when no settings row
	}
	rows, err := s.users.GetMany(ctx, ids)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("settings: %v", err))
	}
	for id, settings := range rows {
		out[id] = settings.ProfilePublic
	}
	return out, nil
}

func profileMatchToProto(
	viewerID string,
	row *models.MatchRow,
	parts []models.MatchParticipantWithUsername,
	discordProfiles map[string]models.DiscordProfile,
	privacy map[string]bool,
) *profilev1.ProfileMatch {
	var self *models.MatchParticipantWithUsername
	for i := range parts {
		if parts[i].DiscordUserID == viewerID {
			self = &parts[i]
			break
		}
	}
	if self == nil {
		return nil
	}

	result := "unknown"
	if row.WinningTeam != nil {
		w := *row.WinningTeam
		if self.Team == w {
			result = "win"
		} else if w == "a" || w == "b" {
			result = "loss"
		}
	}

	pm := &profilev1.ProfileMatch{
		PublicUuid:  row.PublicUUID.String(),
		CreatedAtMs: row.CreatedAt,
		Result:      result,
		Kills:       self.Kills,
		Deaths:      self.Deaths,
		Assists:     self.Assists,
		RatingDelta: self.RatingDelta,
	}

	for _, p := range parts {
		if p.DiscordUserID == viewerID {
			continue
		}
		player := matchPlayerToProto(p, discordProfiles, privacy)
		if p.Team == self.Team {
			pm.Teammates = append(pm.Teammates, player)
		} else {
			pm.Opponents = append(pm.Opponents, player)
		}
	}
	return pm
}

func matchPlayerToProto(
	p models.MatchParticipantWithUsername,
	discordProfiles map[string]models.DiscordProfile,
	privacy map[string]bool,
) *profilev1.ProfileMatchPlayer {
	gameUser := ""
	if p.Username != nil {
		gameUser = *p.Username
	}
	platform := ""
	if p.Platform != nil {
		platform = *p.Platform
	}
	discordUser := ""
	if dp, ok := discordProfiles[p.DiscordUserID]; ok {
		discordUser = dp.Username
	}
	public := true
	if v, ok := privacy[p.DiscordUserID]; ok {
		public = v
	}
	return &profilev1.ProfileMatchPlayer{
		DiscordUserId:   p.DiscordUserID,
		DiscordUsername: discordUser,
		GameUsername:    gameUser,
		Platform:        platform,
		ProfilePublic:   public,
	}
}

func uniqueStrings(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}
