// Package services — tournament service implementation.
//
// The TournamentService orchestrates 9 tournament RPCs:
// CreateTournament, GetTournament, ListTournaments, RegisterTeam,
// UpdateTeamRoster, UnregisterTeam, StartTournament, ReportBracketResult,
// CancelTournament. It depends on the bracket-generation package
// (internal/tourney) and the tournament repositories (internal/repos) and
// is ported 1:1 from src/handlers/tournament.rs.
package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"connectrpc.com/connect"
	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	matchv1 "github.com/parley-bot/parley/gen/parley/matchmaking/v1"
	tournamentv1 "github.com/parley-bot/parley/gen/parley/tournament/v1"
	"github.com/parley-bot/parley/internal/apperr"
	"github.com/parley-bot/parley/internal/matchmaking"
	"github.com/parley-bot/parley/internal/models"
	"github.com/parley-bot/parley/internal/repos"
	"github.com/parley-bot/parley/internal/tourney"
	"github.com/uptrace/bun"
)

// TournamentService wires the tournament repositories and the matchmaking
// engine into a Connect handler. Bracket persistence is delegated to
// internal/tourney so this service stays free of SQL topology knowledge.
type TournamentService struct {
	db       *bun.DB
	tourn    *repos.TournamentRepo
	teams    *repos.TournamentTeamRepo
	rosters  *repos.TournamentRosterRepo
	brackets *repos.BracketMatchRepo
	match    *matchmaking.Service
}

// NewTournamentService returns a service backed by the given handles.
// The db handle is the bun connection used to drive bracket persistence
// in a single transaction.
func NewTournamentService(
	db *bun.DB,
	tourn *repos.TournamentRepo,
	teams *repos.TournamentTeamRepo,
	rosters *repos.TournamentRosterRepo,
	brackets *repos.BracketMatchRepo,
	match *matchmaking.Service,
) *TournamentService {
	return &TournamentService{
		db:       db,
		tourn:    tourn,
		teams:    teams,
		rosters:  rosters,
		brackets: brackets,
		match:    match,
	}
}

// --- helpers ---

// requireR6TournamentGame coerces the proto game enum to a models.Game. R6 is
// the only tournament-supported game today. Named uniquely from the
// matchmaking variant to avoid a cross-file collision in the services
// package.
func requireR6TournamentGame(g commonv1.Game) (models.Game, *connect.Error) {
	game, ok := protoGameToDB(g)
	if !ok || game != models.GameR6 {
		return "", apperr.InvalidArgument("game must be R6")
	}
	return game, nil
}

func int32Ptr(v int32) *int32 { return &v }

func bracketMatchToProto(b models.BracketMatch) *tournamentv1.BracketMatch {
	winnerTo := ""
	if b.WinnerToSlot != nil {
		winnerTo = *b.WinnerToSlot
	}
	loserTo := ""
	if b.LoserToSlot != nil {
		loserTo = *b.LoserToSlot
	}
	teamA := int32(0)
	if b.TeamAID != nil {
		teamA = *b.TeamAID
	}
	teamB := int32(0)
	if b.TeamBID != nil {
		teamB = *b.TeamBID
	}
	winner := int32(0)
	if b.WinnerTeamID != nil {
		winner = *b.WinnerTeamID
	}
	loser := int32(0)
	if b.LoserTeamID != nil {
		loser = *b.LoserTeamID
	}
	winnerMatch := int32(0)
	if b.WinnerToMatchID != nil {
		winnerMatch = *b.WinnerToMatchID
	}
	loserMatch := int32(0)
	if b.LoserToMatchID != nil {
		loserMatch = *b.LoserToMatchID
	}
	custom := int32(0)
	if b.CustomMatchID != nil {
		custom = *b.CustomMatchID
	}
	return &tournamentv1.BracketMatch{
		Id:              b.ID,
		TournamentId:    b.TournamentID,
		Bracket:         b.Bracket,
		RoundNumber:     b.RoundNumber,
		MatchNumber:     b.MatchNumber,
		Status:          b.Status,
		TeamAId:         teamA,
		TeamBId:         teamB,
		WinnerTeamId:    winner,
		LoserTeamId:     loser,
		WinnerToMatchId: winnerMatch,
		WinnerToSlot:    winnerTo,
		LoserToMatchId:  loserMatch,
		LoserToSlot:     loserTo,
		CustomMatchId:   custom,
	}
}

func loadedPlayerToAssignment(p matchmaking.LoadedPlayer) *matchv1.TeamAssignment {
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

func teamToProto(
	t models.TournamentTeam,
	roster []matchmaking.LoadedPlayer,
) *tournamentv1.TournamentTeam {
	assignments := make([]*matchv1.TeamAssignment, 0, len(roster))
	for _, p := range roster {
		assignments = append(assignments, loadedPlayerToAssignment(p))
	}
	seed := int32(0)
	if t.SeedNumber != nil {
		seed = *t.SeedNumber
	}
	return &tournamentv1.TournamentTeam{
		Id:                   t.ID,
		TournamentId:         t.TournamentID,
		GuildId:              t.GuildID,
		ChannelId:            t.ChannelID,
		CaptainDiscordUserId: t.CaptainDiscordUserID,
		TeamName:             t.TeamName,
		Status:               t.Status,
		SeedNumber:           seed,
		StackBalanceAverage:  t.StackBalanceAverage,
		Roster:               assignments,
	}
}

func (s *TournamentService) buildTournamentProto(
	ctx context.Context,
	game models.Game,
	tournament models.Tournament,
) (*tournamentv1.Tournament, error) {
	teams, err := s.teams.ListForTournament(ctx, tournament.ID)
	if err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	rosters, err := s.rosters.ForTournament(ctx, tournament.ID)
	if err != nil {
		return nil, fmt.Errorf("list rosters: %w", err)
	}
	brackets, err := s.brackets.ListForTournament(ctx, tournament.ID)
	if err != nil {
		return nil, fmt.Errorf("list brackets: %w", err)
	}

	protoTeams := make([]*tournamentv1.TournamentTeam, 0, len(teams))
	for _, team := range teams {
		var teamRoster []repos.GuildMemberRow
		var loaded []matchmaking.LoadedPlayer
		for _, r := range rosters {
			if r.TeamID == team.ID {
				teamRoster = append(teamRoster, repos.GuildMemberRow{
					DiscordUserID:   r.DiscordUserID,
					PlayerID:        r.PlayerID,
					InternalElo:     1000,
					RatingDeviation: 350,
					Username:        r.Username,
					Platform:        r.Platform,
				})
			}
		}
		if len(teamRoster) > 0 {
			ids := make([]string, 0, len(teamRoster))
			for _, m := range teamRoster {
				ids = append(ids, m.DiscordUserID)
			}
			loaded, _ = s.match.LoadPlayers(ctx, game, team.GuildID, ids)
		}
		roster := teamToProto(team, loaded)
		roster.Roster = buildRosterAssignments(teamRoster, loaded)
		protoTeams = append(protoTeams, roster)
	}

	protoBrackets := make([]*tournamentv1.BracketMatch, 0, len(brackets))
	for _, b := range brackets {
		protoBrackets = append(protoBrackets, bracketMatchToProto(b))
	}

	startedAt := int64(0)
	if tournament.StartedAt != nil {
		startedAt = *tournament.StartedAt
	}
	completedAt := int64(0)
	if tournament.CompletedAt != nil {
		completedAt = *tournament.CompletedAt
	}
	winner := int32(0)
	if tournament.WinnerEntryID != nil {
		winner = *tournament.WinnerEntryID
	}

	return &tournamentv1.Tournament{
		Id:                     tournament.ID,
		Game:                   dbGameToProto(game),
		Name:                   tournament.Name,
		Format:                 tournament.Format,
		TeamCap:                tournament.TeamCap,
		Visibility:             tournament.Visibility,
		Status:                 tournament.Status,
		CreatedByGuildId:       tournament.CreatedByGuildID,
		CreatedByChannelId:     tournament.CreatedByChannelID,
		CreatedByDiscordUserId: tournament.CreatedByDiscordUserID,
		StartedAtMs:            startedAt,
		CompletedAtMs:          completedAt,
		WinnerTeamId:           winner,
		CreatedAtMs:            tournament.CreatedAt,
		UpdatedAtMs:            tournament.UpdatedAt,
		Teams:                  protoTeams,
		BracketMatches:         protoBrackets,
	}, nil
}

// buildRosterAssignments pairs persisted roster rows with the matching
// LoadedPlayer, returning the TeamAssignment list in roster order.
// Mirrors the load_players-then-zip logic in src/handlers/tournament.rs.
func buildRosterAssignments(
	members []repos.GuildMemberRow,
	loaded []matchmaking.LoadedPlayer,
) []*matchv1.TeamAssignment {
	if len(members) == 0 {
		return nil
	}
	byDiscord := make(map[string]matchmaking.LoadedPlayer, len(loaded))
	for _, p := range loaded {
		byDiscord[p.Member.DiscordUserID] = p
	}
	out := make([]*matchv1.TeamAssignment, 0, len(members))
	for _, m := range members {
		if p, ok := byDiscord[m.DiscordUserID]; ok {
			out = append(out, loadedPlayerToAssignment(p))
			continue
		}
		out = append(out, &matchv1.TeamAssignment{
			DiscordUserId: m.DiscordUserID,
			PlayerId:      m.PlayerID,
			Username:      m.Username,
			Platform:      m.Platform,
			BalanceRating: 0,
		})
	}
	return out
}

// --- RPCs ---

// CreateTournament validates input and inserts a new tournament row in
// the open state. Mirrors create_tournament_rpc in Rust.
func (s *TournamentService) CreateTournament(
	ctx context.Context,
	req *connect.Request[tournamentv1.CreateTournamentRequest],
) (*connect.Response[tournamentv1.TournamentResponse], error) {
	msg := req.Msg
	game, cerr := requireR6TournamentGame(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}
	name := strings.TrimSpace(msg.GetName())
	if name == "" || msg.GetTeamCap() < 2 {
		return nil, apperr.InvalidArgument("name and team_cap >= 2 required")
	}

	visibility := strings.TrimSpace(msg.GetVisibility())
	if visibility == "" {
		visibility = "public"
	}
	format := strings.TrimSpace(msg.GetFormat())
	if format == "" {
		format = "5v5 single_elimination"
	}

	now := time.Now().UTC().UnixMilli()
	row := &models.NewTournament{
		Game:                   game,
		Name:                   name,
		NameNormalized:         tourney.NormalizeTournamentName(name),
		Format:                 format,
		TeamCap:                msg.GetTeamCap(),
		Visibility:             visibility,
		Status:                 repos.TournamentStatusOpen,
		CreatedByGuildID:       strings.TrimSpace(msg.GetGuildId()),
		CreatedByChannelID:     strings.TrimSpace(msg.GetChannelId()),
		CreatedByDiscordUserID: strings.TrimSpace(msg.GetCreatedByDiscordUserId()),
		HubMessageID:           nil,
		FilledAt:               nil,
		AutoStartAt:            nil,
		StartedAt:              nil,
		CompletedAt:            nil,
		WinnerEntryID:          nil,
		CreatedAt:              now,
		UpdatedAt:              now,
	}

	saved, err := s.tourn.Create(ctx, row)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("create: %v", err))
	}

	proto, err := s.buildTournamentProto(ctx, game, *saved)
	if err != nil {
		return nil, apperr.Internal(err.Error())
	}
	return connect.NewResponse(&tournamentv1.TournamentResponse{
		Success:    true,
		Tournament: proto,
	}), nil
}

// GetTournament loads a single tournament by id and returns its proto
// view (teams, rosters, brackets). Mirrors get_tournament_rpc in Rust.
func (s *TournamentService) GetTournament(
	ctx context.Context,
	req *connect.Request[tournamentv1.GetTournamentRequest],
) (*connect.Response[tournamentv1.TournamentResponse], error) {
	msg := req.Msg
	game, cerr := requireR6TournamentGame(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	tournament, err := s.tourn.Get(ctx, game, msg.GetTournamentId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get: %v", err))
	}
	if tournament == nil {
		return nil, apperr.NotFound("tournament not found")
	}

	proto, err := s.buildTournamentProto(ctx, game, *tournament)
	if err != nil {
		return nil, apperr.Internal(err.Error())
	}
	return connect.NewResponse(&tournamentv1.TournamentResponse{
		Success:    true,
		Tournament: proto,
	}), nil
}

// ListTournaments returns tournaments created by the given guild. Limit
// is clamped to 1..200; default 50. Mirrors list_tournaments_rpc in Rust.
func (s *TournamentService) ListTournaments(
	ctx context.Context,
	req *connect.Request[tournamentv1.ListTournamentsRequest],
) (*connect.Response[tournamentv1.ListTournamentsResponse], error) {
	msg := req.Msg
	game, cerr := requireR6TournamentGame(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	limit := int64(50)
	if msg.GetLimit() > 0 {
		l := msg.GetLimit()
		if l < 1 {
			l = 1
		}
		if l > 200 {
			l = 200
		}
		limit = int64(l)
	}

	status := msg.GetStatus()
	var statusPtr *string
	if status != "" {
		statusPtr = &status
	}

	rows, err := s.tourn.ListForGuild(ctx, game, strings.TrimSpace(msg.GetGuildId()), statusPtr, int(limit))
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("list: %v", err))
	}

	protoTournaments := make([]*tournamentv1.Tournament, 0, len(rows))
	for i := range rows {
		proto, err := s.buildTournamentProto(ctx, game, rows[i])
		if err != nil {
			continue
		}
		protoTournaments = append(protoTournaments, proto)
	}

	return connect.NewResponse(&tournamentv1.ListTournamentsResponse{
		Success:     true,
		Tournaments: protoTournaments,
	}), nil
}

// RegisterTeam joins a team into an open tournament, computing the
// stack balance from the loaded players. Mirrors register_team_rpc in
// Rust. The roster is registered transactionally via
// TournamentTeamRepo.Register.
func (s *TournamentService) RegisterTeam(
	ctx context.Context,
	req *connect.Request[tournamentv1.RegisterTeamRequest],
) (*connect.Response[tournamentv1.TeamResponse], error) {
	msg := req.Msg
	game, cerr := requireR6TournamentGame(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	team, err := s.registerTeamInner(
		ctx,
		game,
		msg.GetTournamentId(),
		strings.TrimSpace(msg.GetGuildId()),
		strings.TrimSpace(msg.GetChannelId()),
		strings.TrimSpace(msg.GetCaptainDiscordUserId()),
		strings.TrimSpace(msg.GetTeamName()),
		msg.GetDiscordUserIds(),
	)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&tournamentv1.TeamResponse{
		Success: true,
		Team:    teamToProto(*team, nil),
	}), nil
}

// registerTeamInner performs the validation + persistence for a
// registration. The tournament must be open and have room, and the
// requested roster must match the format's team size.
func (s *TournamentService) registerTeamInner(
	ctx context.Context,
	game models.Game,
	tournamentID int32,
	guildID, channelID, captain, teamName string,
	discordUserIDs []string,
) (*models.TournamentTeam, *connect.Error) {
	tournament, err := s.tourn.Get(ctx, game, tournamentID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get tournament: %v", err))
	}
	if tournament == nil {
		return nil, apperr.FailedPrecondition("tournament not found")
	}
	if tournament.Status != repos.TournamentStatusOpen {
		return nil, apperr.FailedPrecondition("tournament is not open for registration")
	}

	existing, err := s.teams.ListForTournament(ctx, tournamentID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("list teams: %v", err))
	}
	if len(existing) >= int(tournament.TeamCap) {
		return nil, apperr.FailedPrecondition("tournament is full")
	}

	_, teamSize := tourney.ParseTournamentFormat(tournament.Format)
	if len(discordUserIDs) != teamSize {
		return nil, apperr.FailedPrecondition(fmt.Sprintf("expected %d players for this tournament format", teamSize))
	}

	players, err := s.match.LoadPlayers(ctx, game, guildID, discordUserIDs)
	if err != nil {
		return nil, apperr.FailedPrecondition(err.Error())
	}
	var stackTotal float64
	for _, p := range players {
		stackTotal += p.Rated.CPR
	}
	stackAvg := stackTotal / float64(len(players))
	now := time.Now().UTC().UnixMilli()

	row := &models.NewTournamentTeam{
		Game:                 game,
		TournamentID:         tournamentID,
		GuildID:              guildID,
		ChannelID:            channelID,
		CaptainDiscordUserID: captain,
		TeamName:             teamName,
		TeamNameNormalized:   repos.NormalizeTeamName(teamName),
		Status:               repos.TeamStatusRegistered,
		SeedNumber:           nil,
		StackBalanceTotal:    stackTotal,
		StackBalanceAverage:  stackAvg,
		JoinedAt:             now,
		EliminatedAt:         nil,
		CreatedAt:            now,
		UpdatedAt:            now,
	}

	roster := make([]models.NewTournamentTeamRoster, 0, len(players))
	for slot, p := range players {
		roster = append(roster, models.NewTournamentTeamRoster{
			Game:                   game,
			TournamentID:           tournamentID,
			TeamID:                 0,
			DiscordUserID:          p.Member.DiscordUserID,
			PlayerID:               p.Member.PlayerID,
			Slot:                   int32(slot),
			Username:               p.Member.Username,
			Platform:               p.Member.Platform,
			BalanceRating:          p.Rated.CPR,
			SeedRankPoints:         p.Seeds.RankPoints,
			SeedKDRatio:            p.Seeds.KDRatio,
			SeedKost:               p.Seeds.Kost,
			SeedKPR:                p.Seeds.KPR,
			SeedHeadshotPercentage: p.Seeds.HeadshotPercentage,
			SeedScore:              p.Seeds.Score,
			CreatedAt:              now,
			UpdatedAt:              now,
		})
	}

	savedTeam, _, err := s.teams.Register(ctx, row, roster)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("register: %v", err))
	}
	return savedTeam, nil
}

// UpdateTeamRoster replaces the existing roster with a new set of
// Discord user IDs, provided the tournament is still open and the
// captain matches. Mirrors update_team_roster_rpc in Rust.
func (s *TournamentService) UpdateTeamRoster(
	ctx context.Context,
	req *connect.Request[tournamentv1.UpdateTeamRosterRequest],
) (*connect.Response[tournamentv1.TeamResponse], error) {
	msg := req.Msg
	game, cerr := requireR6TournamentGame(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	team, err := s.teams.Get(ctx, game, msg.GetTeamId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get team: %v", err))
	}
	if team == nil {
		return nil, apperr.NotFound("team not found")
	}
	if team.CaptainDiscordUserID != strings.TrimSpace(msg.GetCaptainDiscordUserId()) {
		return nil, apperr.FailedPrecondition("only captain can update roster")
	}

	tournament, err := s.tourn.Get(ctx, game, msg.GetTournamentId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get tournament: %v", err))
	}
	if tournament == nil {
		return nil, apperr.NotFound("tournament not found")
	}
	if tournament.Status != repos.TournamentStatusOpen {
		return nil, apperr.FailedPrecondition("tournament not open")
	}

	_, teamSize := tourney.ParseTournamentFormat(tournament.Format)
	if len(msg.GetDiscordUserIds()) != teamSize {
		return nil, apperr.InvalidArgument(fmt.Sprintf("expected %d players", teamSize))
	}

	players, err := s.match.LoadPlayers(ctx, game, team.GuildID, msg.GetDiscordUserIds())
	if err != nil {
		return nil, apperr.InvalidArgument(err.Error())
	}
	now := time.Now().UTC().UnixMilli()
	roster := make([]models.NewTournamentTeamRoster, 0, len(players))
	for slot, p := range players {
		roster = append(roster, models.NewTournamentTeamRoster{
			Game:                   game,
			TournamentID:           msg.GetTournamentId(),
			TeamID:                 msg.GetTeamId(),
			DiscordUserID:          p.Member.DiscordUserID,
			PlayerID:               p.Member.PlayerID,
			Slot:                   int32(slot),
			Username:               p.Member.Username,
			Platform:               p.Member.Platform,
			BalanceRating:          p.Rated.CPR,
			SeedRankPoints:         p.Seeds.RankPoints,
			SeedKDRatio:            p.Seeds.KDRatio,
			SeedKost:               p.Seeds.Kost,
			SeedKPR:                p.Seeds.KPR,
			SeedHeadshotPercentage: p.Seeds.HeadshotPercentage,
			SeedScore:              p.Seeds.Score,
			CreatedAt:              now,
			UpdatedAt:              now,
		})
	}

	if _, err := s.rosters.ReplaceForTeam(ctx, msg.GetTeamId(), roster); err != nil {
		return nil, apperr.Internal(fmt.Sprintf("replace roster: %v", err))
	}

	return connect.NewResponse(&tournamentv1.TeamResponse{
		Success: true,
		Team:    teamToProto(*team, nil),
	}), nil
}

// UnregisterTeam marks a team as withdrawn. Captain-only and
// open-tournament only. Mirrors unregister_team_rpc in Rust.
func (s *TournamentService) UnregisterTeam(
	ctx context.Context,
	req *connect.Request[tournamentv1.UnregisterTeamRequest],
) (*connect.Response[tournamentv1.TeamResponse], error) {
	msg := req.Msg
	game, cerr := requireR6TournamentGame(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	team, err := s.teams.Get(ctx, game, msg.GetTeamId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get: %v", err))
	}
	if team == nil {
		return nil, apperr.NotFound("team not found")
	}
	if team.CaptainDiscordUserID != strings.TrimSpace(msg.GetCaptainDiscordUserId()) {
		return nil, apperr.FailedPrecondition("only captain can unregister")
	}

	tournament, err := s.tourn.Get(ctx, game, msg.GetTournamentId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get tournament: %v", err))
	}
	if tournament == nil {
		return nil, apperr.NotFound("tournament not found")
	}
	if tournament.Status != repos.TournamentStatusOpen {
		return nil, apperr.FailedPrecondition("tournament not open")
	}

	withdrawn, err := s.teams.Withdraw(ctx, game, msg.GetTeamId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("withdraw: %v", err))
	}
	if withdrawn == nil {
		return nil, apperr.NotFound("team not found")
	}
	return connect.NewResponse(&tournamentv1.TeamResponse{
		Success: true,
		Team:    teamToProto(*withdrawn, nil),
	}), nil
}

// StartTournament seeds the registered teams, generates the bracket
// topology via internal/tourney, and persists every bracket match in a
// single transaction. The tournament then transitions to in_progress.
// Mirrors start_tournament_rpc in Rust.
func (s *TournamentService) StartTournament(
	ctx context.Context,
	req *connect.Request[tournamentv1.StartTournamentRequest],
) (*connect.Response[tournamentv1.TournamentResponse], error) {
	msg := req.Msg
	game, cerr := requireR6TournamentGame(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	minTeams := int32(2)
	if msg.GetMinTeams() > 0 {
		minTeams = msg.GetMinTeams()
	}

	tournament, err := s.tourn.Get(ctx, game, msg.GetTournamentId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get: %v", err))
	}
	if tournament == nil {
		return nil, apperr.NotFound("tournament not found")
	}
	if tournament.Status != repos.TournamentStatusOpen {
		return nil, apperr.FailedPrecondition("tournament not open")
	}

	teams, err := s.teams.ListForTournament(ctx, msg.GetTournamentId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("list teams: %v", err))
	}
	if int32(len(teams)) < minTeams {
		return nil, apperr.FailedPrecondition(fmt.Sprintf("need at least %d teams, have %d", minTeams, len(teams)))
	}

	if err := tourney.SeedAndActivateTeams(ctx, s.db, teams); err != nil {
		return nil, apperr.Internal(fmt.Sprintf("seed: %v", err))
	}

	formatType, _ := tourney.ParseTournamentFormat(tournament.Format)
	var drafts []tourney.BracketDraft
	if formatType == tourney.FormatDoubleElimination {
		drafts = tourney.GenerateDoubleElimination(teamIDs(teams))
	} else {
		drafts = tourney.GenerateSingleElimination(teamIDs(teams))
	}

	if err := tourney.PersistBracket(ctx, s.db, game, msg.GetTournamentId(), drafts); err != nil {
		return nil, apperr.Internal(fmt.Sprintf("bracket: %v", err))
	}

	now := time.Now().UTC().UnixMilli()
	updated, err := s.tourn.UpdateStatus(
		ctx,
		game,
		msg.GetTournamentId(),
		repos.TournamentStatusInProgress,
		&now,
		nil,
		nil,
	)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("update: %v", err))
	}
	if updated == nil {
		return nil, apperr.NotFound("tournament not found")
	}

	proto, err := s.buildTournamentProto(ctx, game, *updated)
	if err != nil {
		return nil, apperr.Internal(err.Error())
	}
	return connect.NewResponse(&tournamentv1.TournamentResponse{
		Success:    true,
		Tournament: proto,
	}), nil
}

// teamIDs extracts team IDs in their current (already-seeded) order.
func teamIDs(teams []models.TournamentTeam) []int32 {
	ids := make([]int32, 0, len(teams))
	for _, t := range teams {
		ids = append(ids, t.ID)
	}
	return ids
}

// ReportBracketResult records a match winner, advances the bracket by
// wiring the winner/loser into the destination slot, and transitions
// the tournament to completed when the final is reported. Mirrors
// report_bracket_result_rpc in Rust.
func (s *TournamentService) ReportBracketResult(
	ctx context.Context,
	req *connect.Request[tournamentv1.ReportBracketResultRequest],
) (*connect.Response[tournamentv1.BracketMatchResponse], error) {
	msg := req.Msg
	game, cerr := requireR6TournamentGame(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	bm, err := s.brackets.Get(ctx, game, msg.GetBracketMatchId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get: %v", err))
	}
	if bm == nil {
		return nil, apperr.NotFound("bracket match not found")
	}

	loserID := int32(0)
	if bm.TeamAID != nil && *bm.TeamAID == msg.GetWinnerTeamId() {
		if bm.TeamBID != nil {
			loserID = *bm.TeamBID
		}
	} else if bm.TeamBID != nil && *bm.TeamBID == msg.GetWinnerTeamId() {
		if bm.TeamAID != nil {
			loserID = *bm.TeamAID
		}
	}

	updatedBM, err := s.brackets.UpdateResult(ctx, msg.GetBracketMatchId(), msg.GetWinnerTeamId(), loserID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("update: %v", err))
	}
	if updatedBM == nil {
		return nil, apperr.NotFound("bracket match not found")
	}

	if loserID > 0 {
		_ = s.teams.Eliminate(ctx, loserID)
	}

	if updatedBM.WinnerToMatchID != nil {
		slot := ""
		if updatedBM.WinnerToSlot != nil {
			slot = *updatedBM.WinnerToSlot
		}
		if slot == "" {
			slot = "a"
		}
		_ = s.brackets.SetTeamSlot(ctx, *updatedBM.WinnerToMatchID, slot, msg.GetWinnerTeamId())
		_ = s.brackets.MarkReadyWhenBothTeams(ctx, *updatedBM.WinnerToMatchID)
	}
	if updatedBM.LoserToMatchID != nil && loserID > 0 {
		slot := ""
		if updatedBM.LoserToSlot != nil {
			slot = *updatedBM.LoserToSlot
		}
		if slot == "" {
			slot = "b"
		}
		_ = s.brackets.SetTeamSlot(ctx, *updatedBM.LoserToMatchID, slot, loserID)
		_ = s.brackets.MarkReadyWhenBothTeams(ctx, *updatedBM.LoserToMatchID)
	}

	tournament, err := s.tourn.Get(ctx, game, bm.TournamentID)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get tournament: %v", err))
	}
	if tournament == nil {
		return nil, apperr.NotFound("tournament not found")
	}

	if updatedBM.WinnerToMatchID == nil && updatedBM.Bracket == "grand_final" {
		now := time.Now().UTC().UnixMilli()
		_, _ = s.tourn.UpdateStatus(
			ctx,
			game,
			bm.TournamentID,
			repos.TournamentStatusCompleted,
			tournament.StartedAt,
			&now,
			int32Ptr(msg.GetWinnerTeamId()),
		)
	} else if updatedBM.WinnerToMatchID == nil && updatedBM.Bracket == "winners" {
		brackets, _ := s.brackets.ListForTournament(ctx, bm.TournamentID)
		var maxRound int32
		hasMax := false
		for _, b := range brackets {
			if b.Bracket == "winners" {
				if !hasMax || b.RoundNumber > maxRound {
					maxRound = b.RoundNumber
					hasMax = true
				}
			}
		}
		if hasMax && updatedBM.RoundNumber == maxRound {
			now := time.Now().UTC().UnixMilli()
			_, _ = s.tourn.UpdateStatus(
				ctx,
				game,
				bm.TournamentID,
				repos.TournamentStatusCompleted,
				tournament.StartedAt,
				&now,
				int32Ptr(msg.GetWinnerTeamId()),
			)
		}
	}

	refreshed, err := s.tourn.Get(ctx, game, bm.TournamentID)
	if err != nil || refreshed == nil {
		return nil, apperr.Internal("tournament reload failed")
	}
	protoTournament, err := s.buildTournamentProto(ctx, game, *refreshed)
	if err != nil {
		return nil, apperr.Internal(err.Error())
	}

	return connect.NewResponse(&tournamentv1.BracketMatchResponse{
		Success:      true,
		BracketMatch: bracketMatchToProto(*updatedBM),
		Tournament:   protoTournament,
	}), nil
}

// CancelTournament transitions a tournament to the cancelled state.
// Only the original creator can cancel. Mirrors cancel_tournament_rpc
// in Rust.
func (s *TournamentService) CancelTournament(
	ctx context.Context,
	req *connect.Request[tournamentv1.CancelTournamentRequest],
) (*connect.Response[tournamentv1.TournamentResponse], error) {
	msg := req.Msg
	game, cerr := requireR6TournamentGame(msg.GetGame())
	if cerr != nil {
		return nil, cerr
	}

	tournament, err := s.tourn.Get(ctx, game, msg.GetTournamentId())
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("get: %v", err))
	}
	if tournament == nil {
		return nil, apperr.NotFound("tournament not found")
	}
	if tournament.CreatedByDiscordUserID != strings.TrimSpace(msg.GetCancelledByDiscordUserId()) {
		return nil, apperr.FailedPrecondition("only creator can cancel")
	}

	updated, err := s.tourn.UpdateStatus(
		ctx,
		game,
		msg.GetTournamentId(),
		repos.TournamentStatusCancelled,
		tournament.StartedAt,
		nil,
		nil,
	)
	if err != nil {
		return nil, apperr.Internal(fmt.Sprintf("update: %v", err))
	}
	if updated == nil {
		return nil, apperr.NotFound("tournament not found")
	}

	proto, err := s.buildTournamentProto(ctx, game, *updated)
	if err != nil {
		return nil, apperr.Internal(err.Error())
	}
	return connect.NewResponse(&tournamentv1.TournamentResponse{
		Success:    true,
		Tournament: proto,
	}), nil
}
