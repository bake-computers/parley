package persist

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/parley-bot/parley/internal/models"
	"github.com/parley-bot/parley/internal/repos"
	"github.com/parley-bot/parley/internal/stats/backends"
	"github.com/parley-bot/parley/internal/stats/scrape"
)

const cacheVersion = 1

const defaultChannelCapacity = 1024

// GuildInvalidator optionally clears guild-scoped caches after a snapshot write.
// Mirrors Rust GuildCache::invalidate_guild (not yet ported to Go).
type GuildInvalidator interface {
	InvalidateGuild(ctx context.Context, game models.Game, guildID string) error
}

type persistReq struct {
	game  backends.Game
	stats scrape.ScrapedStats
}

// SnapshotWriter persists one scraped stats payload (used for tests and production).
type SnapshotWriter interface {
	PersistSnapshot(ctx context.Context, game backends.Game, stats *scrape.ScrapedStats) error
}

// DBSnapshotWriter writes snapshots via identity + snapshot repos.
type DBSnapshotWriter struct {
	Identity   *repos.IdentityRepo
	Snapshots  *repos.PlayerStatSnapshotRepo
	Guild      *repos.GuildRepo
	Invalidate GuildInvalidator
}

func backendToModelGame(game backends.Game) (models.Game, bool) {
	switch game {
	case backends.GameR6:
		return models.GameR6, true
	default:
		return "", false
	}
}

// PersistSnapshot mirrors persist_snapshot in src/stats_persist.rs.
func (w *DBSnapshotWriter) PersistSnapshot(ctx context.Context, game backends.Game, stats *scrape.ScrapedStats) error {
	dbGame, ok := backendToModelGame(game)
	if !ok {
		return nil
	}

	player, err := w.Identity.FindPlayerByUsernameNormalized(ctx, dbGame, stats.Profile.Username)
	if err != nil {
		return err
	}
	if player == nil {
		return nil
	}

	ranked := stats.RankedStats
	now := repos.NowMS()

	metadata, err := json.Marshal(map[string]int32{
		"rounds_played":       ranked.RoundsPlayed,
		"kill_rounds":         ranked.KillRounds,
		"survival_rounds":     ranked.SurvivalRounds,
		"traded_rounds":       ranked.TradedRounds,
		"opening_kill_rounds": ranked.OpeningKillRounds,
	})
	if err != nil {
		return err
	}

	payloadJSON, err := json.Marshal(stats)
	if err != nil {
		return err
	}

	var currentRank *string
	if ranked.CurrentRank != "" {
		cr := ranked.CurrentRank
		currentRank = &cr
	}

	row := &models.NewPlayerStatSnapshot{
		PlayerID:           player.ID,
		Game:               dbGame,
		FetchedAt:          now,
		Source:             "stats.cc",
		CacheVersion:       cacheVersion,
		CurrentRank:        currentRank,
		RankPoints:         ranked.RankPoints,
		Matches:            ranked.Matches,
		Wins:               ranked.Wins,
		Losses:             ranked.Losses,
		Kills:              ranked.Kills,
		Deaths:             ranked.Deaths,
		Assists:            ranked.Assists,
		Headshots:          ranked.Headshots,
		KDRatio:            ranked.KDRatio,
		HeadshotPercentage: ranked.HeadshotPct,
		WinRate:            ranked.WinRate,
		Kost:               stats.CalculatedMetrics.KOST,
		Metadata:           metadata,
		PayloadJSON:        string(payloadJSON),
		CreatedAt:          now,
	}

	if _, err := w.Snapshots.Insert(ctx, row); err != nil {
		return err
	}

	if w.Invalidate != nil && w.Guild != nil {
		guildIDs, err := w.Guild.GuildIDsForPlayer(ctx, dbGame, player.ID)
		if err != nil {
			return nil
		}
		for _, guildID := range guildIDs {
			_ = w.Invalidate.InvalidateGuild(ctx, dbGame, guildID)
		}
	}

	return nil
}

// StatsPersister enqueues snapshot writes on a buffered channel consumed by Run.
type StatsPersister struct {
	ch       chan persistReq
	writer   SnapshotWriter
	capacity int
}

// NewStatsPersister returns a persister with the default channel capacity (1024).
func NewStatsPersister(writer SnapshotWriter) *StatsPersister {
	return NewStatsPersisterWithCapacity(writer, defaultChannelCapacity)
}

// NewStatsPersisterWithCapacity is for tests and custom tuning.
func NewStatsPersisterWithCapacity(writer SnapshotWriter, capacity int) *StatsPersister {
	if capacity < 1 {
		capacity = 1
	}
	return &StatsPersister{
		ch:       make(chan persistReq, capacity),
		writer:   writer,
		capacity: capacity,
	}
}

// Enqueue schedules a snapshot write without blocking the caller.
func (p *StatsPersister) Enqueue(game backends.Game, stats scrape.ScrapedStats) {
	if p == nil || p.writer == nil {
		return
	}
	req := persistReq{game: game, stats: stats}
	select {
	case p.ch <- req:
	default:
		slog.Warn("persist channel full, dropping snapshot",
			"game", game.String(),
			"username", stats.Profile.Username,
			"capacity", p.capacity,
		)
	}
}

// Run consumes the channel until ctx is cancelled, then drains with a timeout.
func (p *StatsPersister) Run(ctx context.Context) {
	if p == nil {
		return
	}
	for {
		select {
		case <-ctx.Done():
			p.drain(5 * time.Second)
			return
		case req := <-p.ch:
			p.handle(ctx, req)
		}
	}
}

func (p *StatsPersister) handle(ctx context.Context, req persistReq) {
	stats := req.stats
	if err := p.writer.PersistSnapshot(ctx, req.game, &stats); err != nil {
		slog.Warn("stats snapshot persist failed", "error", err)
	}
}

func (p *StatsPersister) drain(timeout time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case <-timer.C:
			return
		case req := <-p.ch:
			p.handle(ctx, req)
		}
	}
}

// Close closes the enqueue channel (optional; Run drain uses ctx cancel in production).
func (p *StatsPersister) Close() {
	if p == nil {
		return
	}
	close(p.ch)
}
