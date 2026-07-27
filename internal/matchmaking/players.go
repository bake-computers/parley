package matchmaking

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"

	"github.com/bake-computers/parley/internal/matchmaking/ovi"
	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
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
	Member            repos.GuildMemberRow
	Rated             RatedPlayer
	Seeds             PlayerSeedData
	Features          [ovi.FeatureCount]float64
	RawModelScore     float64
	DisplayModelScore float64
	Roles             [4]float64
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
	return metadataNumber(v)
}

func metadataNumber(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int32:
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
		if !ok {
			return nil, fmt.Errorf("player %s needs a current stats snapshot for model matchmaking", m.Username)
		}
		features, roles, err := featuresFromSnapshot(snap, s.minSeasonMatches)
		if err != nil {
			return nil, fmt.Errorf("player %s: %w", m.Username, err)
		}
		raw, err := s.model.Score(features)
		if err != nil {
			return nil, fmt.Errorf("player %s: %w", m.Username, err)
		}
		seeds := seedsFromSnapshot(snap)
		loaded = append(loaded, LoadedPlayer{
			Member: m,
			Rated: RatedPlayer{
				Mu:  m.InternalElo,
				Phi: m.RatingDeviation,
				CPR: ovi.Clamp(raw),
			},
			Seeds:    seeds,
			Features: features, RawModelScore: raw, DisplayModelScore: ovi.Clamp(raw), Roles: roles,
		})
	}

	// Sort by the caller's original discord_user_id order.
	sortLoadedByOrder(loaded, order)
	return loaded, nil
}

func featuresFromSnapshot(snap models.PlayerStatSnapshot, minimumMatches int32) ([ovi.FeatureCount]float64, [4]float64, error) {
	var zero [ovi.FeatureCount]float64
	var roles [4]float64
	if snap.Matches < minimumMatches {
		return zero, roles, fmt.Errorf("needs at least %d current-season ranked matches", minimumMatches)
	}
	if len(snap.Metadata) == 0 {
		return zero, roles, fmt.Errorf("stats need refreshing for OVI telemetry")
	}
	var meta map[string]any
	if err := json.Unmarshal(snap.Metadata, &meta); err != nil {
		return zero, roles, fmt.Errorf("stats need refreshing for OVI telemetry")
	}
	if season, _ := meta["season_slug"].(string); season == "" {
		return zero, roles, fmt.Errorf("stats need refreshing for OVI telemetry")
	}
	// Keys must be present (value may be 0). Missing keys used to score as 0
	// and silently mis-rank players.
	keys := []string{"rollup_kills", "rollup_deaths", "opening_kill_rounds", "opening_death_rounds", "traded_rounds", "clutch_1v1_wins", "clutch_1v2_wins", "clutch_1v3_wins", "headshot_only_rounds", "rounds_played"}
	values := make(map[string]float64, len(keys))
	for _, key := range keys {
		if _, ok := meta[key]; !ok {
			return zero, roles, fmt.Errorf("stats need refreshing for OVI telemetry")
		}
		values[key] = metadataNumber(meta[key])
	}
	rounds := values["rounds_played"]
	if rounds <= 0 {
		return zero, roles, fmt.Errorf("stats need refreshing for OVI telemetry")
	}
	rollKD := values["rollup_kills"] / math.Max(values["rollup_deaths"], 1)
	entry := values["opening_kill_rounds"] / math.Max(values["opening_kill_rounds"]+values["opening_death_rounds"], 1)
	trade := values["traded_rounds"] / math.Max(values["rollup_deaths"], 1)
	clutch := (values["clutch_1v1_wins"] + 2*values["clutch_1v2_wins"] + 3*values["clutch_1v3_wins"]) / rounds
	exec := values["headshot_only_rounds"] / rounds
	w := math.Min(1, float64(snap.Matches)/20)
	zero = [ovi.FeatureCount]float64{w*snap.KDRatio + (1-w)*rollKD, entry, trade, clutch, w*(snap.HeadshotPercentage/100) + (1-w)*exec, snap.WinRate / 100}
	for _, v := range zero {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return [ovi.FeatureCount]float64{}, roles, fmt.Errorf("invalid OVI telemetry")
		}
	}
	roleValues := zero[1:5]
	total := 0.0
	for _, v := range roleValues {
		if v > 0 {
			total += v
		}
	}
	if total == 0 {
		for i := range roles {
			roles[i] = .25
		}
	} else {
		for i, v := range roleValues {
			if v > 0 {
				roles[i] = v / total
			}
		}
	}
	return zero, roles, nil
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
		sum += p.DisplayModelScore
	}
	return sum / float64(len(players))
}
