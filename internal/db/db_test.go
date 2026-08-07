package db_test

import (
	"context"
	"testing"

	"github.com/bake-computers/parley/internal/config"
	"github.com/bake-computers/parley/internal/db"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
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
	if n != 24 {
		t.Fatalf("registered migrations = %d, want 24", n)
	}
}

func TestSSLModeDisableDoesNotEnableTLS(t *testing.T) {
	poolCfg, err := pgxpool.ParseConfig(
		"postgresql://user:password@postgres.host:5432/parley?sslmode=disable",
	)
	require.NoError(t, err)

	require.Nil(t, poolCfg.ConnConfig.TLSConfig)

	for _, fallback := range poolCfg.ConnConfig.Fallbacks {
		require.Nil(t, fallback.TLSConfig)
	}
}
