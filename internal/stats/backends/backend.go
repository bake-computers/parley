package backends

import (
	"context"

	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// StatsBackend is one upstream provider of stats for a specific game.
type StatsBackend interface {
	Game() Game
	Fetch(ctx context.Context, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error)
	FetchCollection(ctx context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

// StatsBackendRegistry dispatches fetch calls by game.
type StatsBackendRegistry struct {
	byGame map[Game]StatsBackend
}

// NewStatsBackendRegistry returns an empty registry.
func NewStatsBackendRegistry() *StatsBackendRegistry {
	return &StatsBackendRegistry{byGame: make(map[Game]StatsBackend)}
}

// Register inserts or replaces the backend for its Game().
func (r *StatsBackendRegistry) Register(backend StatsBackend) {
	if backend == nil {
		return
	}
	r.byGame[backend.Game()] = backend
}

// Get returns the backend for a game, if any.
func (r *StatsBackendRegistry) Get(game Game) (StatsBackend, bool) {
	b, ok := r.byGame[game]
	return b, ok
}

// Has reports whether a backend is registered for the game.
func (r *StatsBackendRegistry) Has(game Game) bool {
	_, ok := r.byGame[game]
	return ok
}

// Fetch returns scraped stats or GcUnavailable when no backend is registered.
func (r *StatsBackendRegistry) Fetch(ctx context.Context, game Game, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
	b, ok := r.byGame[game]
	if !ok {
		return scrape.ScrapedStats{}, registryUnavailable(game, season)
	}
	return b.Fetch(ctx, username, platform, season)
}

// FetchCollection returns a full season collection or GcUnavailable when missing.
func (r *StatsBackendRegistry) FetchCollection(ctx context.Context, game Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	b, ok := r.byGame[game]
	if !ok {
		return scrape.ScrapedStatsCollection{}, registryUnavailable(game, nil)
	}
	return b.FetchCollection(ctx, username, platform)
}

func registryUnavailable(game Game, season *string) *fetch.StatsFetchError {
	err := fetch.NewStatsFetchError(
		fetch.StatsFetchErrorGcUnavailable,
		"no backend registered for game="+game.String(),
		true,
	)
	if season != nil {
		err.RequestedSeason = *season
	}
	return err
}
