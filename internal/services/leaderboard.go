// Package services — leaderboard Redis ZSET store and RPC business logic.
// Ported from src/leaderboard.rs and src/handlers/leaderboard.rs.
package services

import (
	"context"
	"fmt"

	"github.com/pactum-computers/parley/internal/models"
	"github.com/pactum-computers/parley/internal/stats/scrape"
	"github.com/redis/go-redis/v9"
)

const leaderboardKeyPrefix = "lb"

// Kind identifies which ZSET metric is queried.
type Kind int

const (
	KindElo Kind = iota
	KindWinRate
	KindRankPoints
)

func (k Kind) String() string {
	switch k {
	case KindWinRate:
		return "winrate"
	case KindRankPoints:
		return "rp"
	default:
		return "elo"
	}
}

// Entry is one row in a leaderboard slice.
type Entry struct {
	PlayerID string
	Rank     int64
	Score    float64
}

// Store is the leaderboard persistence port (Redis ZSET or test double).
type Store interface {
	Touch(ctx context.Context, game models.Game, guildID, playerID string, stats *scrape.ScrapedStats) error
	Top(ctx context.Context, game models.Game, guildID string, kind Kind, limit, offset int64) ([]Entry, error)
	PlayerRank(ctx context.Context, game models.Game, guildID string, kind Kind, playerID string) (*Entry, error)
	Count(ctx context.Context, game models.Game, guildID string, kind Kind) (int64, error)
	Remove(ctx context.Context, game models.Game, guildID, playerID string) error
}

// RedisStore implements Store against Redis sorted sets.
type RedisStore struct {
	client redis.Cmdable
}

// NewRedisStore returns a store backed by the given Redis client.
func NewRedisStore(client redis.Cmdable) *RedisStore {
	return &RedisStore{client: client}
}

func leaderboardKey(game models.Game, guildID string, kind Kind) string {
	scope := guildID
	if scope == "" {
		scope = "global"
	}
	return fmt.Sprintf("%s:%s:%s:%s", leaderboardKeyPrefix, string(game), scope, kind.String())
}

// Touch updates elo, win rate, and rank-points ZSETs for a player.
func (s *RedisStore) Touch(ctx context.Context, game models.Game, guildID, playerID string, stats *scrape.ScrapedStats) error {
	if stats == nil {
		return nil
	}
	rp := float64(stats.RankedStats.RankPoints)
	wr := stats.RankedStats.WinRate
	pipe := s.client.Pipeline()
	pipe.ZAdd(ctx, leaderboardKey(game, guildID, KindElo), redis.Z{Score: rp, Member: playerID})
	pipe.ZAdd(ctx, leaderboardKey(game, guildID, KindWinRate), redis.Z{Score: wr, Member: playerID})
	pipe.ZAdd(ctx, leaderboardKey(game, guildID, KindRankPoints), redis.Z{Score: rp, Member: playerID})
	_, err := pipe.Exec(ctx)
	return err
}

// Top returns the highest-scoring members in descending order.
func (s *RedisStore) Top(ctx context.Context, game models.Game, guildID string, kind Kind, limit, offset int64) ([]Entry, error) {
	key := leaderboardKey(game, guildID, kind)
	stop := offset + limit - 1
	vals, err := s.client.ZRevRangeWithScores(ctx, key, offset, stop).Result()
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(vals))
	for i, z := range vals {
		member, _ := z.Member.(string)
		out = append(out, Entry{
			PlayerID: member,
			Rank:     offset + int64(i) + 1,
			Score:    z.Score,
		})
	}
	return out, nil
}

// PlayerRank returns one player's rank and score, or nil if absent.
func (s *RedisStore) PlayerRank(ctx context.Context, game models.Game, guildID string, kind Kind, playerID string) (*Entry, error) {
	key := leaderboardKey(game, guildID, kind)
	rank, err := s.client.ZRevRank(ctx, key, playerID).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	score, err := s.client.ZScore(ctx, key, playerID).Result()
	if err != nil {
		return nil, err
	}
	return &Entry{PlayerID: playerID, Rank: rank + 1, Score: score}, nil
}

// Count returns the number of members in the ZSET.
func (s *RedisStore) Count(ctx context.Context, game models.Game, guildID string, kind Kind) (int64, error) {
	return s.client.ZCard(ctx, leaderboardKey(game, guildID, kind)).Result()
}

// Remove deletes a player from all leaderboard kinds for the scope.
func (s *RedisStore) Remove(ctx context.Context, game models.Game, guildID, playerID string) error {
	pipe := s.client.Pipeline()
	for _, kind := range []Kind{KindElo, KindWinRate, KindRankPoints} {
		pipe.ZRem(ctx, leaderboardKey(game, guildID, kind), playerID)
	}
	_, err := pipe.Exec(ctx)
	return err
}

// LeaderboardService implements GetLeaderboard and GetPlayerRank domain logic.
type LeaderboardService struct {
	store Store
}

// NewLeaderboardService returns a service backed by store (required).
func NewLeaderboardService(store Store) *LeaderboardService {
	return &LeaderboardService{store: store}
}

// GetLeaderboardParams holds normalized query inputs.
type GetLeaderboardParams struct {
	Game    models.Game
	GuildID string
	Kind    Kind
	Limit   int32
	Offset  int32
}

// GetLeaderboardResult is the domain result before proto mapping.
type GetLeaderboardResult struct {
	Entries    []Entry
	TotalCount int64
}

func clampLimit(limit int32) int64 {
	if limit < 1 {
		return 1
	}
	if limit > 500 {
		return 500
	}
	return int64(limit)
}

func clampOffset(offset int32) int64 {
	if offset < 0 {
		return 0
	}
	return int64(offset)
}

// GetLeaderboard fetches a page of leaderboard entries.
func (s *LeaderboardService) GetLeaderboard(ctx context.Context, p GetLeaderboardParams) (GetLeaderboardResult, error) {
	limit := clampLimit(p.Limit)
	offset := clampOffset(p.Offset)
	entries, err := s.store.Top(ctx, p.Game, p.GuildID, p.Kind, limit, offset)
	if err != nil {
		return GetLeaderboardResult{}, err
	}
	total, err := s.store.Count(ctx, p.Game, p.GuildID, p.Kind)
	if err != nil {
		return GetLeaderboardResult{}, err
	}
	return GetLeaderboardResult{Entries: entries, TotalCount: total}, nil
}

// GetPlayerRankParams holds a single-player rank query.
type GetPlayerRankParams struct {
	Game     models.Game
	GuildID  string
	PlayerID string
	Kind     Kind
}

// GetPlayerRank returns one player's entry or nil when not ranked.
func (s *LeaderboardService) GetPlayerRank(ctx context.Context, p GetPlayerRankParams) (*Entry, error) {
	return s.store.PlayerRank(ctx, p.Game, p.GuildID, p.Kind, p.PlayerID)
}
