package matchmaking

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/pactum-computers/parley/internal/models"
	"github.com/pactum-computers/parley/internal/repos"
)

// PlayerSeedData is the subset of stats persisted on a
// match_participants row to seed the next match. Mirrors PlayerSeedData
// in src/matchmaking/players.rs.
type PlayerSeedData struct {
	RankPoints         int32
	KDRatio            float64
	Kost               float64
	KPR                float64
	HeadshotPercentage float64
	Score              float64
}

// LoadedPlayer bundles a guild member with their computed rating and
// stat seed. Mirrors LoadedPlayer in src/matchmaking/players.rs.
type LoadedPlayer struct {
	Member repos.GuildMemberRow
	Rated  RatedPlayer
	Seeds  PlayerSeedData
}

// rawStatsFromSnapshot derives the RawPlayerStats from a stat snapshot
// row. KPR and survival_rate are computed from the per-snapshot
// "rounds_played" and "survival_rounds" metadata keys. Mirrors
// raw_stats_from_snapshot in src/matchmaking/players.rs.
func rawStatsFromSnapshot(snap models.PlayerStatSnapshot) RawPlayerStats {
	rounds := snapshotMetadataF64(snap.Metadata, "rounds_played")
	survivalRounds := snapshotMetadataF64(snap.Metadata, "survival_rounds")
	var kpr float64
	if rounds > 0 {
		kpr = float64(snap.Kills) / rounds
	}
	var survivalRate float64
	if rounds > 0 {
		survivalRate = survivalRounds / rounds * 100.0
	}
	return RawPlayerStats{
		KD:           snap.KDRatio,
		WinRate:      snap.WinRate,
		KPR:          kpr,
		MMR:          float64(snap.RankPoints),
		Kost:         snap.Kost,
		SurvivalRate: survivalRate,
		HSPercentage: snap.HeadshotPercentage,
		TKPenalty:    0,
	}
}

// seedsFromSnapshot extracts the persisted seed data from a snapshot row.
// Mirrors seeds_from_snapshot in src/matchmaking/players.rs.
func seedsFromSnapshot(snap models.PlayerStatSnapshot) PlayerSeedData {
	rounds := snapshotMetadataF64(snap.Metadata, "rounds_played")
	var kpr float64
	if rounds > 0 {
		kpr = float64(snap.Kills) / rounds
	}
	return PlayerSeedData{
		RankPoints:         snap.RankPoints,
		KDRatio:            snap.KDRatio,
		Kost:               snap.Kost,
		KPR:                kpr,
		HeadshotPercentage: snap.HeadshotPercentage,
		Score:              float64(snap.RankPoints),
	}
}

// snapshotMetadataF64 reads a numeric field out of the snapshot's
// jsonb metadata column, returning 0 when missing or unparseable.
func snapshotMetadataF64(meta json.RawMessage, key string) float64 {
	if len(meta) == 0 {
		return 0
	}
	var m map[string]any
	if err := json.Unmarshal(meta, &m); err != nil {
		return 0
	}
	v, ok := m[key]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	}
	return 0
}

// ComputeNorms returns the population norms for a guild, derived from
// the latest stat snapshots of every member in the guild's roster.
// The norms are recomputed every call in the Go port (the Rust version
// caches them in a guild cache; that cache is the caller's
// responsibility). Mirrors compute_norms in src/matchmaking/players.rs.
func (s *Service) ComputeNorms(
	ctx context.Context,
	game models.Game,
	guildID string,
) (PopulationNorms, error) {
	members, err := s.guild.ListMembersForGuild(ctx, game, guildID)
	if err != nil {
		// Match the Rust behavior: a failed roster load is treated
		// as empty rather than fatal.
		members = nil
	}
	playerIDs := make([]int32, 0, len(members))
	for _, m := range members {
		playerIDs = append(playerIDs, m.PlayerID)
	}

	snapshots, err := s.snapshot.LatestForPlayers(ctx, game, playerIDs)
	if err != nil {
		snapshots = nil
	}
	samples := make([]RawPlayerStats, 0, len(snapshots))
	for _, snap := range snapshots {
		samples = append(samples, rawStatsFromSnapshot(snap))
	}
	return (&PopulationNorms{}).FromSamples(samples), nil
}

// LoadPlayers resolves a list of Discord user IDs into LoadedPlayer
// rows enriched with computed rating (mu/phi/cpr) and seed data. The
// returned slice preserves the caller's discord_user_id order. Mirrors
// load_players in src/matchmaking/players.rs.
func (s *Service) LoadPlayers(
	ctx context.Context,
	game models.Game,
	guildID string,
	discordUserIDs []string,
) ([]LoadedPlayer, error) {
	if len(discordUserIDs) == 0 {
		return nil, fmt.Errorf("discord_user_ids must not be empty")
	}
	seen := make(map[string]struct{}, len(discordUserIDs))
	for _, id := range discordUserIDs {
		if _, ok := seen[id]; ok {
			return nil, fmt.Errorf("duplicate discord_user_ids")
		}
		seen[id] = struct{}{}
	}

	members, err := s.guild.FindMembersByDiscordIDs(ctx, game, guildID, discordUserIDs)
	if err != nil {
		return nil, fmt.Errorf("load memberships: %w", err)
	}
	if len(members) != len(discordUserIDs) {
		return nil, fmt.Errorf("one or more discord_user_ids are not registered in this guild")
	}

	norms, err := s.ComputeNorms(ctx, game, guildID)
	if err != nil {
		return nil, err
	}

	playerIDs := make([]int32, 0, len(members))
	for _, m := range members {
		playerIDs = append(playerIDs, m.PlayerID)
	}
	snapshots, err := s.snapshot.LatestForPlayers(ctx, game, playerIDs)
	if err != nil {
		return nil, fmt.Errorf("load snapshots: %w", err)
	}
	snapByPlayer := make(map[int32]models.PlayerStatSnapshot, len(snapshots))
	for _, snap := range snapshots {
		snapByPlayer[snap.PlayerID] = snap
	}

	order := make(map[string]int, len(discordUserIDs))
	for i, id := range discordUserIDs {
		order[id] = i
	}

	loaded := make([]LoadedPlayer, 0, len(members))
	for _, m := range members {
		snap, ok := snapByPlayer[m.PlayerID]
		var matchStats PlayerMatchStats
		var seeds PlayerSeedData
		if ok {
			matchStats = NewPlayerMatchStatsFromRaw(rawStatsFromSnapshot(snap), &norms)
			seeds = seedsFromSnapshot(snap)
		} else {
			matchStats = NeutralPlayerMatchStats()
			seeds = PlayerSeedData{}
		}
		loaded = append(loaded, LoadedPlayer{
			Member: m,
			Rated: RatedPlayer{
				Mu:  m.InternalElo,
				Phi: m.RatingDeviation,
				CPR: CalculateCPR(matchStats),
			},
			Seeds: seeds,
		})
	}

	// Sort by the caller's original discord_user_id order.
	sortLoadedByOrder(loaded, order)
	return loaded, nil
}

// sortLoadedByOrder reorders loaded in-place to match the original
// discord_user_id ordering. Unmapped rows fall back to index 0
// (mirrors the Rust `unwrap_or(0)` default).
func sortLoadedByOrder(loaded []LoadedPlayer, order map[string]int) {
	sort.SliceStable(loaded, func(i, j int) bool {
		oi, hasI := order[loaded[i].Member.DiscordUserID]
		oj, hasJ := order[loaded[j].Member.DiscordUserID]
		if !hasI {
			oi = 0
		}
		if !hasJ {
			oj = 0
		}
		return oi < oj
	})
}

// ExpectedLobbyCPR returns the mean CPR across a slice of loaded
// players. Returns 0 for an empty slice. Mirrors expected_lobby_cpr in
// src/matchmaking/players.rs.
func ExpectedLobbyCPR(players []LoadedPlayer) float64 {
	if len(players) == 0 {
		return 0
	}
	var sum float64
	for _, p := range players {
		sum += p.Rated.CPR
	}
	return sum / float64(len(players))
}
