package repos_test

import (
	"testing"

	"github.com/bake-computers/parley/internal/repos"
)

func TestMatchStatusConstants(t *testing.T) {
	if repos.MatchStatusPending != "pending" {
		t.Fatalf("MatchStatusPending = %q", repos.MatchStatusPending)
	}
	if repos.MatchStatusCompleted != "completed" {
		t.Fatalf("MatchStatusCompleted = %q", repos.MatchStatusCompleted)
	}
}

func TestKeysetCursorFromStringRoundTrip(t *testing.T) {
	s, err := repos.EncodeCursor(1_700_000_000_000, 42)
	if err != nil {
		t.Fatalf("EncodeCursor: %v", err)
	}
	cur, err := repos.KeysetCursorFromString(s)
	if err != nil {
		t.Fatalf("KeysetCursorFromString: %v", err)
	}
	if cur == nil {
		t.Fatal("expected cursor")
	}
	if cur.CreatedAt != 1_700_000_000_000 || cur.ID != 42 {
		t.Fatalf("cursor = %+v", cur)
	}
	empty, err := repos.KeysetCursorFromString("")
	if err != nil {
		t.Fatalf("empty cursor: %v", err)
	}
	if empty != nil {
		t.Fatalf("empty should be nil, got %+v", empty)
	}
}

func TestKeysetCursorInvalidBase64(t *testing.T) {
	_, err := repos.KeysetCursorFromString("not-base64!!!")
	if err == nil {
		t.Fatal("expected error")
	}
	if !repos.IsCursorError(err) {
		t.Fatalf("expected CursorError, got %v", err)
	}
}
