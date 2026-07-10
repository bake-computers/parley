package matchmaking

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/pactum-computers/parley/internal/repos"
)

// Run drives the background sweeper loop on a fixed interval. The loop
// exits when ctx is cancelled, returning ctx.Err(). Per-tick failures
// are logged and do not stop the loop. Mirrors spawn + run_once in
// src/matchmaking/sweeper.rs.
func (s *Service) Run(ctx context.Context, interval time.Duration) error {
	if interval <= 0 {
		interval = 5 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := s.Tick(ctx); err != nil {
				log.Printf("matchmaking: sweeper tick failed: %v", err)
			}
		}
	}
}

// Tick is a single one-shot pass: expire stale queues, then iterate the
// distinct (game, guild, team_size, matchmaking_region) pools and try to form a match in
// each. It is the unit-level entry point used by tests and by the
// sweeper loop. Mirrors run_once in src/matchmaking/sweeper.rs.
func (s *Service) Tick(ctx context.Context) error {
	now := nowMS()
	if _, err := s.queue.ExpireStale(ctx, now); err != nil {
		return fmt.Errorf("expire: %w", err)
	}

	pools, err := s.queue.DistinctWaitingPools(ctx)
	if err != nil {
		return fmt.Errorf("list pools: %w", err)
	}

	for _, p := range pools {
		elig, err := s.LoadEligibility(ctx, p.Game, p.GuildID)
		if err != nil {
			return fmt.Errorf("load eligibility: %w", err)
		}
		if _, err := s.SweepPool(
			ctx, p.Game, p.GuildID, p.TeamSize, p.MatchmakingRegion, "", "sweeper", elig,
		); err != nil {
			return fmt.Errorf("sweep pool: %w", err)
		}
	}
	return nil
}

// Compiles only: the constant is exported for symmetry with the
// QueueStatus constants in repos and is consulted indirectly via the
// repos.QueueStatusWaiting path.
var _ = repos.QueueStatusWaiting
