package matchmaking_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/pactum-computers/parley/internal/matchmaking"
)

// TestSweeperRunRespectsCancellation verifies the sweeper loop exits
// when its context is cancelled. The run does not require a DB because
// it should never reach the first tick when the context is already
// cancelled.
func TestSweeperRunRespectsCancellation(t *testing.T) {
	t.Parallel()

	// A nil *Service is fine here: Run must exit via ctx.Done()
	// before it ever tries to use any repository.
	var s *matchmaking.Service
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan error, 1)
	go func() { done <- s.Run(ctx, 1*time.Millisecond) }()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Run returned %v, want context.Canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return within 2s after ctx cancellation")
	}
}
