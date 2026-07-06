package matchmaking

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/pactum-computers/parley/internal/models"
	"github.com/pactum-computers/parley/internal/repos"
)

// FormedMatch is the result of a successful match formation: the
// persisted match id, the team partition that produced it, the
// player list in their original order, the queue ids that were
// consumed, the lobby's mean CPR, the public UUID used for the
// landing-page link, and the host guild id. Mirrors FormedMatch in
// src/matchmaking/queue.rs.
type FormedMatch struct {
	MatchID          int32
	Partition        TeamPartition
	Players          []LoadedPlayer
	StackIDs         []int32
	ExpectedLobbyCPR float64
	PublicUUID       uuid.UUID
	HostGuildID      string
}

// FindMatchingStackIndices searches the given stacks for a subset whose
// total player_count exactly equals lobby_size. Returns the first
// matching subset's stack indices or nil. Mirrors
// find_matching_stack_indices in src/matchmaking/queue.rs.
func FindMatchingStackIndices(stacks []models.MatchmakingQueue, lobbySize int) []int {
	n := len(stacks)
	if n == 0 {
		return nil
	}
	limit := 1 << 16
	if n < 16 {
		limit = 1 << n
	}
	for mask := 0; mask < limit; mask++ {
		sum := 0
		var indices []int
		for i := 0; i < n; i++ {
			if mask&(1<<i) != 0 {
				sum += int(stacks[i].PlayerCount)
				indices = append(indices, i)
			}
		}
		if sum == lobbySize {
			return indices
		}
	}
	return nil
}

// TryFormMatch scans the guild's waiting queue for a set of stacks that
// fills a lobby of size 2*teamSize, applies all eligibility rules,
// partitions the players into two balanced teams, and persists the
// resulting match in a single transaction. Returns (nil, nil) when no
// stack combination is currently available. Mirrors try_form_match in
// src/matchmaking/queue.rs.
func (s *Service) TryFormMatch(
	ctx context.Context,
	game models.Game,
	guildID, channelID, createdBy string,
	teamSize int32,
	elig *EligibilityContext,
) (*FormedMatch, error) {
	stacks, err := s.queue.FindWaitingForPool(ctx, game, guildID, teamSize)
	if err != nil {
		return nil, fmt.Errorf("load stacks: %w", err)
	}

	lobbySize := int(teamSize) * 2
	maxGap := int32(500)
	if elig != nil && elig.Rules != nil {
		maxGap = elig.Rules.MaxEloGap
	}

	stackIDs := make([]int32, 0, len(stacks))
	for _, st := range stacks {
		stackIDs = append(stackIDs, st.ID)
	}
	participants, err := s.queue.ParticipantsForQueues(ctx, stackIDs)
	if err != nil {
		return nil, fmt.Errorf("load participants: %w", err)
	}

	indices := FindMatchingStackIndices(stacks, lobbySize)
	if indices == nil {
		return nil, nil
	}

	selectedStacks := make([]models.MatchmakingQueue, 0, len(indices))
	selectedIDs := make([]int32, 0, len(indices))
	for _, i := range indices {
		selectedStacks = append(selectedStacks, stacks[i])
		selectedIDs = append(selectedIDs, stacks[i].ID)
	}

	// Flatten participants in stack order.
	discordIDs := make([]string, 0, lobbySize)
	for _, st := range selectedStacks {
		for _, p := range participants {
			if p.QueueID == st.ID {
				discordIDs = append(discordIDs, p.DiscordUserID)
			}
		}
	}

	players, err := s.LoadPlayers(ctx, game, guildID, discordIDs)
	if err != nil {
		return nil, err
	}
	members := make([]repos.GuildMemberRow, 0, len(players))
	for _, p := range players {
		members = append(members, p.Member)
	}
	if err := s.CheckQueueEligibility(ctx, game, guildID, discordIDs, members, elig); err != nil {
		return nil, err
	}
	if err := CheckLobbyEloGap(members, maxGap); err != nil {
		return nil, err
	}

	rated := make([]RatedPlayer, 0, len(players))
	for _, p := range players {
		rated = append(rated, p.Rated)
	}
	partition := PartitionTeams(rated, int(teamSize))
	if partition == nil {
		return nil, fmt.Errorf("team partition failed")
	}

	lobbyCPR := ExpectedLobbyCPR(players)

	var teamACPR, teamBCPR, teamASeed, teamBSeed float64
	for _, i := range partition.TeamA {
		teamACPR += rated[i].CPR
		teamASeed += players[i].Seeds.Score
	}
	for _, i := range partition.TeamB {
		teamBCPR += rated[i].CPR
		teamBSeed += players[i].Seeds.Score
	}

	publicUUID := uuid.New()
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
		SeedGap:                      absDiff(teamASeed, teamBSeed),
		WinningTeam:                  nil,
		ResolutionType:               "played",
		TeamABalanceTotal:            teamACPR,
		TeamBBalanceTotal:            teamBCPR,
		BalanceGap:                   partition.BalanceGap,
		CreatedAt:                    nowMS(),
		UpdatedAt:                    nowMS(),
		PublicUUID:                   &publicUUID,
	}

	participantsA := make([]models.NewMatchParticipant, 0, len(partition.TeamA))
	for slot, idx := range partition.TeamA {
		p := players[idx]
		participantsA = append(participantsA, models.NewMatchParticipant{
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
			Kills:                  nil,
			Deaths:                 nil,
			CreatedAt:              newMatch.CreatedAt,
			UpdatedAt:              newMatch.UpdatedAt,
		})
	}
	participantsB := make([]models.NewMatchParticipant, 0, len(partition.TeamB))
	for slot, idx := range partition.TeamB {
		p := players[idx]
		participantsB = append(participantsB, models.NewMatchParticipant{
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
			Kills:                  nil,
			Deaths:                 nil,
			CreatedAt:              newMatch.CreatedAt,
			UpdatedAt:              newMatch.UpdatedAt,
		})
	}
	allParticipants := make([]models.NewMatchParticipant, 0, len(participantsA)+len(participantsB))
	allParticipants = append(allParticipants, participantsA...)
	allParticipants = append(allParticipants, participantsB...)

	saved, _, err := s.match.Create(ctx, newMatch, allParticipants)
	if err != nil {
		return nil, fmt.Errorf("create match: %w", err)
	}
	if _, err := s.queue.MarkMatched(ctx, selectedIDs, saved.ID); err != nil {
		return nil, fmt.Errorf("mark matched: %w", err)
	}

	return &FormedMatch{
		MatchID:          saved.ID,
		Partition:        *partition,
		Players:          players,
		StackIDs:         selectedIDs,
		ExpectedLobbyCPR: lobbyCPR,
		PublicUUID:       saved.PublicUUID,
		HostGuildID:      guildID,
	}, nil
}

// CreateStack inserts a new waiting queue row plus its participants.
// Mirrors create_stack in src/matchmaking/queue.rs.
func (s *Service) CreateStack(
	ctx context.Context,
	game models.Game,
	guildID, channelID, captainDiscordUserID string,
	teamSize int32,
	players []LoadedPlayer,
) (*models.MatchmakingQueue, []models.MatchmakingQueueParticipant, error) {
	now := nowMS()
	var stackTotal float64
	for _, p := range players {
		stackTotal += p.Rated.CPR
	}
	var stackAvg float64
	if len(players) > 0 {
		stackAvg = stackTotal / float64(len(players))
	}

	queue := &models.NewMatchmakingQueue{
		Game:                 game,
		GuildID:              guildID,
		ChannelID:            channelID,
		CaptainDiscordUserID: captainDiscordUserID,
		Status:               repos.QueueStatusWaiting,
		PlayerCount:          int32(len(players)),
		StackBalanceTotal:    stackTotal,
		StackBalanceAverage:  stackAvg,
		MatchedMatchID:       nil,
		ExpiresAt:            now + QueueExpiryMS,
		CreatedAt:            now,
		UpdatedAt:            now,
		TeamSize:             teamSize,
	}

	parts := make([]models.NewMatchmakingQueueParticipant, 0, len(players))
	for slot, p := range players {
		parts = append(parts, models.NewMatchmakingQueueParticipant{
			Game:                   game,
			QueueID:                0,
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

	return s.queue.CreateStack(ctx, queue, parts)
}

// SweepPool is the one-shot entry point the background sweeper calls
// per (game, guild, team_size) tuple. It is a thin wrapper around
// TryFormMatch and exists for naming parity with the Rust
// sweep_pool in src/matchmaking/queue.rs.
func (s *Service) SweepPool(
	ctx context.Context,
	game models.Game,
	guildID string,
	teamSize int32,
	channelID, createdBy string,
	elig *EligibilityContext,
) (*FormedMatch, error) {
	formed, err := s.TryFormMatch(ctx, game, guildID, channelID, createdBy, teamSize, elig)
	if err != nil || formed == nil {
		return formed, err
	}
	return formed, nil
}

// nowMS is a tiny indirection so tests can stub the clock later if
// needed. Delegates to repos.NowMS for the canonical epoch ms.
func nowMS() int64 {
	return repos.NowMS()
}

// absDiff returns |a - b| for two float64s.
func absDiff(a, b float64) float64 {
	d := a - b
	if d < 0 {
		return -d
	}
	return d
}
