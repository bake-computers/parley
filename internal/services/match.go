// Package services — match service implementation.
//
// The MatchService is a thin orchestration layer over the matchmaking
// engine and the match / guild repositories. All match
// mathematics (CPR, Glicko-2, partition) live in
// internal/matchmaking. All persistence lives in internal/repos. This
// file only coordinates the two and adapts their output to the
// ConnectRPC v1 wire types.
package services

import (
	"context"
	"fmt"
	"strings"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	commonv1 "github.com/pactum-computers/parley/gen/parley/common/v1"
	matchv1 "github.com/pactum-computers/parley/gen/parley/matchmaking/v1"
	"github.com/pactum-computers/parley/internal/apperr"
	"github.com/pactum-computers/parley/internal/matchmaking"
	"github.com/pactum-computers/parley/internal/models"
	"github.com/pactum-computers/parley/internal/repos"
)

// MatchService orchestrates the MatchmakingService RPCs.
type MatchService struct {
	match       *repos.MatchRepo
	guild       *repos.GuildRepo
	matchmaking *matchmaking.Service
}

// NewMatchService returns a service backed by the given repos.
func NewMatchService(
	match *repos.MatchRepo,
	guild *repos.GuildRepo,
	mm *matchmaking.Service,
) *MatchService {
	return &MatchService{
		match:       match,
		guild:       guild,
		matchmaking: mm,
	}
}

// requireR6Game coerces the proto game enum to a models.Game. R6 is
// the only matchmaking-supported game today. Mirrors the
// `proto_game_to_db` helpers in src/handlers/match_queue.rs and
// src/handlers/matchmaking.rs.
func requireR6Game(g commonv1.Game) (models.Game, *connect.Error) {
	game, ok := protoGameToDB(g)
	if !ok || game != models.GameR6 {
		return "", apperr.InvalidArgument("game must be R6")
	}
	return game, nil
}

// resolveTeamSize returns the requested team size, falling back to
// the guild's default_team_format and finally the matchmaking
// default of 5. Mirrors `resolve_team_size` in
// src/handlers/match_queue.rs.
func resolveTeamSize(
	ctx context.Context,
	guild *repos.GuildRepo,
	game models.Game,
	guildID string,
	requested int32,
) (int32, error) {
	if requested > 0 {
		return requested, nil
	}
	settings, err := guild.GetSettings(ctx, guildID, game)
	if err != nil {
		return 0, err
	}
	var format *string
	if settings != nil {
		format = settings.DefaultTeamFormat
	}
	return int32(matchmaking.ParseTeamSize(format)), nil
}

// assignmentsFromPartition converts a `*matchmaking.TeamPartition` and
// the loaded players into the wire-level `[]*matchv1.TeamAssignment`.
// Mirrors `assignments_from_partition` in
// src/handlers/match_queue.rs and the inline `to_assignment` closure
// in src/handlers/matchmaking.rs.
func assignmentsFromPartition(
	players []matchmaking.LoadedPlayer,
	teamA, teamB []int,
) ([]*matchv1.TeamAssignment, []*matchv1.TeamAssignment) {
	toAssignment := func(idx int) *matchv1.TeamAssignment {
		p := players[idx]
		return &matchv1.TeamAssignment{
			DiscordUserId: p.Member.DiscordUserID,
			PlayerId:      p.Member.PlayerID,
			Username:      p.Member.Username,
			Platform:      p.Member.Platform,
			BalanceRating: p.Rated.CPR,
			Mu:            p.Rated.Mu,
			Phi:           p.Rated.Phi,
			Cpr:           p.Rated.CPR,
		}
	}
	a := make([]*matchv1.TeamAssignment, 0, len(teamA))
	for _, i := range teamA {
		a = append(a, toAssignment(i))
	}
	b := make([]*matchv1.TeamAssignment, 0, len(teamB))
	for _, i := range teamB {
		b = append(b, toAssignment(i))
	}
	return a, b
}

// matchToProto maps a match row and its participants to the wire
// `Match` message. Mirrors `match_to_proto` in
// src/handlers/match_queue.rs.
func matchToProto(
	row *models.MatchRow,
	parts []models.MatchParticipantWithUsername,
) *matchv1.Match {
	out := &matchv1.Match{
		Id:           row.ID,
		GuildId:      row.GuildID,
		ChannelId:    row.ChannelID,
		Status:       row.Status,
		MatchType:    row.MatchType,
		BalanceGap:   row.BalanceGap,
		CreatedAtMs:  row.CreatedAt,
		PublicUuid:   row.PublicUUID.String(),
		Participants: make([]*matchv1.MatchParticipant, 0, len(parts)),
	}
	if row.WinningTeam != nil {
		out.WinningTeam = *row.WinningTeam
	}
	for _, p := range parts {
		username := ""
		if p.Username != nil {
			username = *p.Username
		}
		platform := ""
		if p.Platform != nil {
			platform = *p.Platform
		}
		out.Participants = append(out.Participants, &matchv1.MatchParticipant{
			DiscordUserId: p.DiscordUserID,
			PlayerId:      p.PlayerID,
			Team:          p.Team,
			Slot:          p.Slot,
			Username:      username,
			BalanceRating: p.BalanceRating,
			Cpr:           p.BalanceRating,
			Platform:      platform,
		})
	}
	return out
}

// --- BuildTeams ---

// BuildTeams partitions a list of discord_user_ids into two balanced
// teams using the CPR + Glicko-2 + brute-force pipeline, without
// persisting a match. Mirrors build_teams_rpc in
// src/handlers/matchmaking.rs.
func (s *MatchService) BuildTeams(
	ctx context.Context,
	req *connect.Request[matchv1.BuildTeamsRequest],
) (*connect.Response[matchv1.BuildTeamsResponse], error) {
	msg := req.Msg
	game, cerr := requireR6Game(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}
	guildID := strings.TrimSpace(msg.GetGuildId())
	if guildID == "" {
		return nil, apperr.InvalidArgument("guild_id is required")
	}
	discordIDs := msg.GetDiscordUserIds()
	if len(discordIDs) == 0 {
		return nil, apperr.InvalidArgument("discord_user_ids must not be empty")
	}

	teamSize, err := resolveTeamSize(ctx, s.guild, game, guildID, msg.GetTeamSize())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("resolve team size: %v", err))
	}
	expected := int(teamSize) * 2
	if len(discordIDs) != expected {
		return nil, apperr.InvalidArgument(fmt.Sprintf(
			"expected %d discord_user_ids for team_size %d, got %d",
			expected, teamSize, len(discordIDs),
		))
	}
	seen := make(map[string]struct{}, len(discordIDs))
	for _, id := range discordIDs {
		if _, ok := seen[id]; ok {
			return nil, apperr.InvalidArgument("duplicate discord_user_ids")
		}
		seen[id] = struct{}{}
	}

	// matchmaking.LoadPlayers already does the membership lookup,
	// norms computation, snapshot fetch, and CPR calculation. It also
	// sorts the result to match the caller's id order.
	players, err := s.matchmaking.LoadPlayers(ctx, game, guildID, discordIDs)
	if err != nil {
		return nil, apperr.InvalidArgument(err.Error())
	}

	// Per-team platform/elo gap rules: matchmaking's CheckEligibility
	// covers the same surface; BuildTeams applies the rules to the full
	// lobby as a precondition.
	members := make([]repos.GuildMemberRow, 0, len(players))
	for _, p := range players {
		members = append(members, p.Member)
	}
	settings, err := s.guild.GetSettings(ctx, guildID, game)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get settings: %v", err))
	}
	rules, err := s.guild.GetMatchmakingRules(ctx, guildID, game)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get rules: %v", err))
	}
	_ = settings // reserved for future custom team format handling.
	if rules != nil {
		if len(rules.Platforms) > 0 {
			allowed := make(map[string]struct{}, len(rules.Platforms))
			for _, p := range rules.Platforms {
				allowed[strings.ToLower(p)] = struct{}{}
			}
			for _, m := range members {
				if _, ok := allowed[strings.ToLower(m.Platform)]; !ok {
					return nil, apperr.FailedPrecondition(fmt.Sprintf(
						"player %s platform %s not allowed", m.Username, m.Platform,
					))
				}
			}
		}
		if rules.MaxEloGap > 0 {
			if err := matchmaking.CheckLobbyEloGap(members, rules.MaxEloGap); err != nil {
				return nil, apperr.FailedPrecondition(err.Error())
			}
		}
	}

	rated := make([]matchmaking.RatedPlayer, 0, len(players))
	for _, p := range players {
		rated = append(rated, p.Rated)
	}
	partition := matchmaking.PartitionTeams(rated, int(teamSize))
	if partition == nil {
		return nil, apperr.Internal("team partition failed")
	}
	teamA, teamB := assignmentsFromPartition(players, partition.TeamA, partition.TeamB)

	return connect.NewResponse(&matchv1.BuildTeamsResponse{
		Success:          true,
		TeamA:            teamA,
		TeamB:            teamB,
		WinProbability:   partition.WinProbability,
		BalanceGap:       partition.BalanceGap,
		ExpectedLobbyCpr: matchmaking.ExpectedLobbyCPR(players),
	}), nil
}

// --- ListGuildMembers ---

// ListGuildMembers returns the full roster for a guild, optionally
// filtered by a username prefix. Mirrors list_guild_members_rpc in
// src/handlers/matchmaking.rs.
func (s *MatchService) ListGuildMembers(
	ctx context.Context,
	req *connect.Request[matchv1.ListGuildMembersRequest],
) (*connect.Response[matchv1.ListGuildMembersResponse], error) {
	msg := req.Msg
	game, cerr := requireR6Game(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}
	guildID := strings.TrimSpace(msg.GetGuildId())
	if guildID == "" {
		return nil, apperr.InvalidArgument("guild_id is required")
	}

	limit := int32(500)
	if msg.GetLimit() > 0 {
		limit = msg.GetLimit()
		if limit < 1 {
			limit = 1
		}
		if limit > 2000 {
			limit = 2000
		}
	}

	rows, err := s.guild.ListMembersForGuild(ctx, game, guildID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("list members: %v", err))
	}
	rows = filterMembers(rows, msg.GetQuery(), int(limit))

	out := make([]*matchv1.GuildMember, 0, len(rows))
	for _, m := range rows {
		out = append(out, &matchv1.GuildMember{
			DiscordUserId: m.DiscordUserID,
			PlayerId:      m.PlayerID,
			Username:      m.Username,
			Platform:      m.Platform,
			InternalElo:   m.InternalElo,
		})
	}
	return connect.NewResponse(&matchv1.ListGuildMembersResponse{
		Success: true,
		Members: out,
	}), nil
}

// filterMembers applies a case-insensitive prefix filter and limit.
// Mirrors `filter_members` in src/handlers/matchmaking.rs.
func filterMembers(rows []repos.GuildMemberRow, query string, limit int) []repos.GuildMemberRow {
	q := strings.ToLower(strings.TrimSpace(query))
	var out []repos.GuildMemberRow
	if q == "" {
		out = rows
	} else {
		for _, m := range rows {
			if strings.HasPrefix(strings.ToLower(m.Username), q) {
				out = append(out, m)
			}
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

// --- CreateCustomMatch ---

// CreateCustomMatch partitions the supplied discord_user_ids into two
// balanced teams and persists the match. Mirrors create_custom_match_rpc
// in src/handlers/match_queue.rs.
func (s *MatchService) CreateCustomMatch(
	ctx context.Context,
	req *connect.Request[matchv1.CreateCustomMatchRequest],
) (*connect.Response[matchv1.CreateCustomMatchResponse], error) {
	msg := req.Msg
	game, cerr := requireR6Game(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}
	guildID := strings.TrimSpace(msg.GetGuildId())
	channelID := strings.TrimSpace(msg.GetChannelId())
	createdBy := strings.TrimSpace(msg.GetCreatedByDiscordUserId())
	if guildID == "" {
		return nil, apperr.InvalidArgument("guild_id is required")
	}
	if channelID == "" {
		return nil, apperr.InvalidArgument("channel_id is required")
	}
	if createdBy == "" {
		return nil, apperr.InvalidArgument("created_by_discord_user_id is required")
	}

	teamSize, err := resolveTeamSize(ctx, s.guild, game, guildID, msg.GetTeamSize())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("resolve team size: %v", err))
	}
	expected := int(teamSize) * 2
	if len(msg.GetDiscordUserIds()) != expected {
		return nil, apperr.InvalidArgument(fmt.Sprintf(
			"expected %d players for team_size %d", expected, teamSize,
		))
	}

	elig, err := s.matchmaking.LoadEligibility(ctx, game, guildID)
	if err != nil {
		return nil, apperr.Internal(err.Error())
	}
	players, err := s.matchmaking.LoadPlayers(ctx, game, guildID, msg.GetDiscordUserIds())
	if err != nil {
		return nil, apperr.InvalidArgument(err.Error())
	}
	members := make([]repos.GuildMemberRow, 0, len(players))
	for _, p := range players {
		members = append(members, p.Member)
	}
	if err := s.matchmaking.CheckEligibility(ctx, game, guildID, msg.GetDiscordUserIds(), members, elig); err != nil {
		return nil, apperr.FailedPrecondition(err.Error())
	}

	rated := make([]matchmaking.RatedPlayer, 0, len(players))
	for _, p := range players {
		rated = append(rated, p.Rated)
	}
	partition := matchmaking.PartitionTeams(rated, int(teamSize))
	if partition == nil {
		return nil, apperr.Internal("team partition failed")
	}

	now := NowMS()
	var teamACPR, teamBCPR, teamASeed, teamBSeed float64
	for _, i := range partition.TeamA {
		teamACPR += rated[i].CPR
		teamASeed += players[i].Seeds.Score
	}
	for _, i := range partition.TeamB {
		teamBCPR += rated[i].CPR
		teamBSeed += players[i].Seeds.Score
	}

	newMatch := &models.NewMatch{
		Game:                         game,
		GuildID:                      guildID,
		ChannelID:                    channelID,
		MessageID:                    "pending",
		CreatedByDiscordUserID:       createdBy,
		Status:                       repos.MatchStatusActive,
		MatchType:                    "internal",
		OpponentGuildID:              nil,
		OpponentChannelID:            nil,
		OpponentMessageID:            nil,
		OpponentCaptainDiscordUserID: nil,
		TeamASeedTotal:               teamASeed,
		TeamBSeedTotal:               teamBSeed,
		SeedGap:                      absFloat(teamASeed - teamBSeed),
		WinningTeam:                  nil,
		ResolutionType:               "played",
		TeamABalanceTotal:            teamACPR,
		TeamBBalanceTotal:            teamBCPR,
		BalanceGap:                   partition.BalanceGap,
		CreatedAt:                    now,
		UpdatedAt:                    now,
		PublicUUID:                   nil,
	}

	participants := make([]models.NewMatchParticipant, 0, expected)
	for slot, idx := range partition.TeamA {
		p := players[idx]
		participants = append(participants, models.NewMatchParticipant{
			Game:                   game,
			MatchID:                0,
			DiscordUserID:          p.Member.DiscordUserID,
			PlayerID:               p.Member.PlayerID,
			Team:                   "a",
			Slot:                   int32(slot),
			SeedRankPoints:         p.Seeds.RankPoints,
			SeedKDRatio:            p.Seeds.KDRatio,
			SeedKost:               p.Seeds.Kost,
			SeedKPR:                p.Seeds.KPR,
			SeedHeadshotPercentage: p.Seeds.HeadshotPercentage,
			SeedScore:              p.Seeds.Score,
			BalanceRating:          p.Rated.CPR,
			CreatedAt:              now,
			UpdatedAt:              now,
		})
	}
	for slot, idx := range partition.TeamB {
		p := players[idx]
		participants = append(participants, models.NewMatchParticipant{
			Game:                   game,
			MatchID:                0,
			DiscordUserID:          p.Member.DiscordUserID,
			PlayerID:               p.Member.PlayerID,
			Team:                   "b",
			Slot:                   int32(slot),
			SeedRankPoints:         p.Seeds.RankPoints,
			SeedKDRatio:            p.Seeds.KDRatio,
			SeedKost:               p.Seeds.Kost,
			SeedKPR:                p.Seeds.KPR,
			SeedHeadshotPercentage: p.Seeds.HeadshotPercentage,
			SeedScore:              p.Seeds.Score,
			BalanceRating:          p.Rated.CPR,
			CreatedAt:              now,
			UpdatedAt:              now,
		})
	}

	saved, _, err := s.match.Create(ctx, newMatch, participants)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("create match: %v", err))
	}

	teamA, teamB := assignmentsFromPartition(players, partition.TeamA, partition.TeamB)
	return connect.NewResponse(&matchv1.CreateCustomMatchResponse{
		Success:        true,
		MatchId:        saved.ID,
		TeamA:          teamA,
		TeamB:          teamB,
		WinProbability: partition.WinProbability,
		BalanceGap:     partition.BalanceGap,
	}), nil
}

// absFloat returns |x|.
func absFloat(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func parsePublicUUID(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}

// --- ReportMatchResult ---

// ReportMatchResult updates each participant's Glicko rating based on
// the match outcome, then marks the match completed. Mirrors
// report_match_result_rpc in src/handlers/match_queue.rs.
func (s *MatchService) ReportMatchResult(
	ctx context.Context,
	req *connect.Request[matchv1.ReportMatchResultRequest],
) (*connect.Response[matchv1.ReportMatchResultResponse], error) {
	msg := req.Msg
	winning := strings.ToLower(strings.TrimSpace(msg.GetWinningTeam()))
	if winning != "a" && winning != "b" {
		return nil, apperr.InvalidArgument("winning_team must be 'a' or 'b'")
	}
	game, cerr := requireR6Game(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	row, err := s.match.Get(ctx, game, msg.GetMatchId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get match: %v", err))
	}
	if row == nil {
		return nil, apperr.NotFound("match not found")
	}

	parts, err := s.match.Participants(ctx, row.ID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("participants: %v", err))
	}

	lobbyCPR := 0.0
	if len(parts) > 0 {
		var sum float64
		for _, p := range parts {
			sum += p.BalanceRating
		}
		lobbyCPR = sum / float64(len(parts))
	}

	var teamA, teamB []models.MatchParticipantWithUsername
	for _, p := range parts {
		switch p.Team {
		case "a":
			teamA = append(teamA, p)
		case "b":
			teamB = append(teamB, p)
		}
	}
	oppMuA, oppMuB := opponentMu(teamA), opponentMu(teamB)
	// Both phis are a fixed 350 in the Rust implementation.
	const oppPhi = 350.0

	for _, p := range parts {
		memberships, err := s.guild.FindMembersByDiscordIDs(ctx, game, row.GuildID, []string{p.DiscordUserID})
		if err != nil || len(memberships) == 0 {
			continue
		}
		member := memberships[0]
		won := p.Team == winning
		var oppMu float64
		switch p.Team {
		case "a":
			oppMu = oppMuB
		case "b":
			oppMu = oppMuA
		default:
			continue
		}
		var outcome float64
		if won {
			outcome = 1.0
		}
		newMu, newPhi := matchmaking.UpdateRating(
			member.InternalElo,
			member.RatingDeviation,
			oppMu,
			oppPhi,
			outcome,
			p.BalanceRating,
			lobbyCPR,
		)
		if err := s.guild.UpdateMembershipRating(ctx, game, row.GuildID, p.DiscordUserID, newMu, newPhi, won); err != nil {
			// Rating update is non-fatal in the Rust handler; the
			// match still completes. Mirrors `let _ = ...await`.
			continue
		}
	}

	completed, err := s.match.Complete(ctx, game, row.ID, winning)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("complete: %v", err))
	}
	if completed == nil {
		return nil, apperr.NotFound("match not found")
	}

	updated, err := s.match.Participants(ctx, completed.ID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("participants: %v", err))
	}
	return connect.NewResponse(&matchv1.ReportMatchResultResponse{
		Success: true,
		Match:   matchToProto(completed, updated),
	}), nil
}

// opponentMu mirrors the opponent_mu computation in
// src/handlers/match_queue.rs. Empty teams fall back to 1000.
func opponentMu(team []models.MatchParticipantWithUsername) float64 {
	if len(team) == 0 {
		return 1000.0
	}
	return float64(len(team)) * 1000.0 / float64(len(team))
}

// --- GetMatch ---

// GetMatch returns a single match by id. Mirrors get_match_rpc in
// src/handlers/match_queue.rs.
func (s *MatchService) GetMatch(
	ctx context.Context,
	req *connect.Request[matchv1.GetMatchRequest],
) (*connect.Response[matchv1.GetMatchResponse], error) {
	msg := req.Msg
	game, cerr := requireR6Game(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}
	row, err := s.match.Get(ctx, game, msg.GetMatchId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get: %v", err))
	}
	if row == nil {
		return nil, apperr.NotFound("match not found")
	}
	parts, err := s.match.Participants(ctx, row.ID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("participants: %v", err))
	}
	return connect.NewResponse(&matchv1.GetMatchResponse{
		Success: true,
		Match:   matchToProto(row, parts),
	}), nil
}

// --- ListMatches ---

// ListMatches paginates by guild or by user with keyset cursors.
// Mirrors list_matches_rpc in src/handlers/match_queue.rs.
func (s *MatchService) ListMatches(
	ctx context.Context,
	req *connect.Request[matchv1.ListMatchesRequest],
) (*connect.Response[matchv1.ListMatchesResponse], error) {
	msg := req.Msg
	game, cerr := requireR6Game(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}
	guildID := strings.TrimSpace(msg.GetGuildId())
	if guildID == "" {
		return nil, apperr.InvalidArgument("guild_id is required")
	}
	limit := int64(5)
	if msg.GetLimit() > 0 {
		limit = int64(msg.GetLimit())
	}
	cursor, err := repos.KeysetCursorFromString(msg.GetCursor())
	if err != nil {
		return nil, apperr.InvalidArgument("invalid cursor")
	}

	var rows []models.MatchRow
	if userID := strings.TrimSpace(msg.GetDiscordUserId()); userID != "" {
		rows, err = s.match.ListForUser(ctx, game, userID, limit, cursor)
	} else {
		rows, err = s.match.ListForGuild(ctx, game, guildID, limit, cursor)
	}
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("list matches: %v", err))
	}

	matches := make([]*matchv1.Match, 0, len(rows))
	for i := range rows {
		parts, perr := s.match.Participants(ctx, rows[i].ID)
		if perr != nil {
			return nil, apperr.Internal(fmt.Sprintf("participants: %v", perr))
		}
		matches = append(matches, matchToProto(&rows[i], parts))
	}
	var nextCursor string
	if int64(len(rows)) == limit && len(rows) > 0 {
		encoded, encErr := repos.EncodeCursor(rows[len(rows)-1].CreatedAt, rows[len(rows)-1].ID)
		if encErr != nil {
			return nil, apperr.Internal(fmt.Sprintf("encode cursor: %v", encErr))
		}
		nextCursor = encoded
	}
	return connect.NewResponse(&matchv1.ListMatchesResponse{
		Matches:    matches,
		NextCursor: nextCursor,
	}), nil
}

// --- GetMatchByUuid ---

// GetMatchByUuid looks up a match by its public UUID. Mirrors
// get_match_by_uuid_rpc in src/handlers/match_queue.rs.
func (s *MatchService) GetMatchByUuid(
	ctx context.Context,
	req *connect.Request[matchv1.GetMatchByUuidRequest],
) (*connect.Response[matchv1.GetMatchByUuidResponse], error) {
	msg := req.Msg
	game, cerr := requireR6Game(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}
	publicUUID, err := parsePublicUUID(msg.GetPublicUuid())
	if err != nil {
		return nil, apperr.InvalidArgument("invalid public_uuid")
	}
	row, err := s.match.GetByUUID(ctx, game, publicUUID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get by uuid: %v", err))
	}
	if row == nil {
		return nil, apperr.NotFound("match not found")
	}
	parts, err := s.match.Participants(ctx, row.ID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("participants: %v", err))
	}
	return connect.NewResponse(&matchv1.GetMatchByUuidResponse{
		Success: true,
		Match:   matchToProto(row, parts),
	}), nil
}
