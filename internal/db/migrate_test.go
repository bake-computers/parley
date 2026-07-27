package db_test

import (
	"context"
	"testing"
	"time"

	"github.com/bake-computers/parley/internal/config"
	"github.com/bake-computers/parley/internal/db"
	"github.com/bake-computers/parley/internal/testutil"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestMigrations(t *testing.T) {
	if !testutil.DockerAvailable() {
		t.Skip("docker not available")
	}
	testutil.PrepareDockerForTestcontainers(t)

	ctx := context.Background()

	pg, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("parley_test"),
		postgres.WithUsername("parley"),
		postgres.WithPassword("parley"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() {
		if err := pg.Terminate(ctx); err != nil {
			t.Logf("terminate postgres: %v", err)
		}
	})

	connStr, err := pg.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

	cfg := &config.Config{
		DatabaseURL:   connStr,
		RunMigrations: true,
		DBTLS:         "none",
		DBPoolMax:     4,
		DBPoolMinIdle: 1,
	}

	bunDB, err := db.New(ctx, cfg)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() {
		if bunDB != nil {
			_ = bunDB.Close()
		}
	})

	if err := db.Ping(ctx, bunDB); err != nil {
		t.Fatalf("Ping() error = %v", err)
	}

	var enumExists int
	err = bunDB.NewRaw("SELECT COUNT(*)::int FROM pg_type WHERE typname = 'games'").Scan(ctx, &enumExists)
	if err != nil {
		t.Fatalf("query games enum: %v", err)
	}
	if enumExists != 1 {
		t.Fatalf("games enum count = %d, want 1", enumExists)
	}
}
