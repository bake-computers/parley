package repos_test

import (
	"testing"

	"github.com/parley-bot/parley/internal/repos"
)

func TestDiscordUserIDHashDeterministic(t *testing.T) {
	const user = "123456789012345678"
	const secret = "test-secret"
	a := repos.DiscordUserIDHash(user, secret)
	b := repos.DiscordUserIDHash(user, secret)
	if a != b {
		t.Fatalf("hash mismatch: %q vs %q", a, b)
	}
	if len(a) != 64 {
		t.Fatalf("sha256 hex length = %d, want 64", len(a))
	}
}

func TestDeletionCooldownMS(t *testing.T) {
	const want = 30 * 24 * 60 * 60 * 1000
	if repos.DeletionCooldownMS != want {
		t.Fatalf("DeletionCooldownMS = %d, want %d", repos.DeletionCooldownMS, want)
	}
}
