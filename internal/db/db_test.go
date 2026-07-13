package db_test

import (
	"context"
	"testing"

	"github.com/pactum-computers/parley/internal/config"
	"github.com/pactum-computers/parley/internal/db"
)

func TestNew_RequiresDatabaseURL(t *testing.T) {
	ctx := context.Background()
	cfg := &config.Config{}
	got, err := db.New(ctx, cfg)
	if err == nil {
		t.Fatal("New() error = nil, want DATABASE_URL required")
	}
	if got != nil {
		t.Fatalf("New() = %v, want nil", got)
	}
}

func TestEmbeddedMigrationCount(t *testing.T) {
	if err := db.EnsureMigrationsRegistered(); err != nil {
		t.Fatalf("EnsureMigrationsRegistered: %v", err)
	}
	n := len(db.Migrations.Sorted())
	if n != 19 {
		t.Fatalf("registered migrations = %d, want 19", n)
	}
}
