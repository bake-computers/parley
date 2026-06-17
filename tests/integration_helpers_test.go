//go:build integration
// +build integration

// Package tests contains end-to-end integration tests that exercise the
// parley engine-service against a real Postgres spun up via testcontainers.
//
// These tests mirror the Rust `tests/*.rs` integration tests (Plan 30 of the
// rust-to-go port). They use the `integration` build tag so plain
// `go test ./tests/...` stays green in environments without Docker, while
// `go test -tags=integration ./tests/...` runs the full suite.
//
//	go test ./tests/...                   # empty (no files compile)
//	go test -tags=integration ./tests/... # full integration suite
package tests

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/pactum-computers/parley/gen/parley/guild/v1/guildv1connect"
	"github.com/pactum-computers/parley/gen/parley/identity/v1/identityv1connect"
	"github.com/pactum-computers/parley/gen/parley/user/v1/userv1connect"
	"github.com/pactum-computers/parley/internal/config"
	"github.com/pactum-computers/parley/internal/db"
	"github.com/pactum-computers/parley/internal/handlers"
	"github.com/pactum-computers/parley/internal/repos"
	"github.com/pactum-computers/parley/internal/services"
	"github.com/pactum-computers/parley/internal/testutil"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/uptrace/bun"
)

// newTestPostgres spins up a throwaway Postgres 16 container with a fixed
// database/user/password (matching the convention used by the rest of the
// repo). The returned connection string is ready to feed into db.New with
// sslmode=disable semantics. The cleanup function terminates the container.
func newTestPostgres(t *testing.T) (connStr string, cleanup func()) {
	t.Helper()
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

	cleanup = func() {
		if err := pg.Terminate(ctx); err != nil {
			t.Logf("terminate postgres: %v", err)
		}
	}

	connStr, err = pg.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		cleanup()
		t.Fatalf("postgres connection string: %v", err)
	}
	return connStr, cleanup
}

// newTestBunDB spins up a fresh Postgres container, opens a *bun.DB pool
// against it, and runs all pending migrations. Cleanup closes the pool and
// terminates the container. Use this when the test needs direct DB access
// rather than the HTTP surface.
func newTestBunDB(t *testing.T) (bdb *bun.DB, cleanup func()) {
	t.Helper()
	connStr, pgCleanup := newTestPostgres(t)

	cfg := &config.Config{
		DatabaseURL:   connStr,
		RunMigrations: true,
		DBTLS:         "none",
		DBPoolMax:     4,
		DBPoolMinIdle: 1,
	}
	bdb, err := db.New(context.Background(), cfg)
	if err != nil {
		pgCleanup()
		t.Fatalf("db.New: %v", err)
	}

	cleanup = func() {
		if bdb != nil {
			_ = bdb.Close()
		}
		pgCleanup()
	}
	return bdb, cleanup
}

// engineTestRig wires up a minimal but functional engine stack behind an
// httptest.Server: identity + guild settings + user settings (the RPC
// surfaces we exercise in tests/identity_link_test.go) plus the /health and
// /ready probes from cmd/parley/main.go. Stats/match/tournament/leaderboard
// are intentionally not wired — keeping the rig small avoids dragging in
// Redis and the stats pipeline for the round-trip tests.
//
// The returned server is httptest.Server. The cleanup closes the server
// and tears down the Postgres container.
type engineTestRig struct {
	Server *httptest.Server
	BunDB  *bun.DB

	Identity *services.IdentityService
	Users    *services.UserSettingsService

	IdentityClient identityv1connect.IdentityServiceClient
	UserClient     userv1connect.UserSettingsServiceClient
	GuildClient    guildv1connect.GuildSettingsServiceClient
}

func newEngineWithDB(t *testing.T) *engineTestRig {
	t.Helper()
	connStr, pgCleanup := newTestPostgres(t)

	cfg := &config.Config{
		DatabaseURL:   connStr,
		RunMigrations: true,
		DBTLS:         "none",
		DBPoolMax:     4,
		DBPoolMinIdle: 1,
	}
	bunDB, err := db.New(context.Background(), cfg)
	if err != nil {
		pgCleanup()
		t.Fatalf("db.New: %v", err)
	}

	// Repos that the identity + user services need.
	identityRepo := repos.NewIdentityRepo(bunDB)
	guildRepo := repos.NewGuildRepo(bunDB)
	userRepo := repos.NewUserSettingsRepo(bunDB)

	// Set the HMAC secret before building the user handler (the handler
	// captures it at construction time via os.Getenv).
	t.Setenv("ACCOUNT_DELETION_HMAC_SECRET", "test-hmac-secret-do-not-use-in-prod")

	identitySvc := services.NewIdentityService(identityRepo, guildRepo)
	guildSvc := services.NewGuildService(guildRepo)
	userSvc := services.NewUserSettingsService(userRepo, guildRepo, identityRepo)

	// Build the mux the same way cmd/parley/main.go does — keep the wiring
	// as a self-contained block so future service additions follow the
	// same shape.
	mux := http.NewServeMux()
	identityPath, identityHandler := identityv1connect.NewIdentityServiceHandler(handlers.NewIdentityHandler(identitySvc))
	mux.Handle(identityPath, identityHandler)
	guildPath, guildHandler := guildv1connect.NewGuildSettingsServiceHandler(handlers.NewGuildHandler(guildSvc))
	mux.Handle(guildPath, guildHandler)
	userPath, userHandler := userv1connect.NewUserSettingsServiceHandler(handlers.NewUserHandler(userSvc))
	mux.Handle(userPath, userHandler)

	// /health and /ready mirror cmd/parley/main.go.
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		if bunDB != nil {
			if err := db.Ping(r.Context(), bunDB); err != nil {
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte("NOT READY"))
				return
			}
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("READY"))
	})

	server := httptest.NewServer(mux)

	// Connect clients for typed assertions.
	httpClient := &http.Client{Timeout: 5 * time.Second}
	identityClient := identityv1connect.NewIdentityServiceClient(httpClient, server.URL)
	userClient := userv1connect.NewUserSettingsServiceClient(httpClient, server.URL)
	guildClient := guildv1connect.NewGuildSettingsServiceClient(httpClient, server.URL)

	rig := &engineTestRig{
		Server:         server,
		BunDB:          bunDB,
		Identity:       identitySvc,
		Users:          userSvc,
		IdentityClient: identityClient,
		UserClient:     userClient,
		GuildClient:    guildClient,
	}
	t.Cleanup(func() {
		server.Close()
		if bunDB != nil {
			_ = bunDB.Close()
		}
		pgCleanup()
	})
	return rig
}

// newEngineNoDB returns an engine rig without a database. It exposes the
// same /health and /ready probes, but with bunDB = nil so the /ready handler
// short-circuits to 200 "READY" (this matches the degraded-mode behaviour
// in cmd/parley/main.go when DATABASE_URL is unset).
func newEngineNoDB(t *testing.T) *engineTestRig {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, _ *http.Request) {
		// No DB configured → ready without checking.
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("READY"))
	})

	server := httptest.NewServer(mux)
	rig := &engineTestRig{Server: server}
	t.Cleanup(func() { server.Close() })
	return rig
}

// connectErrCode returns the connect.Code from an error, or
// connect.CodeUnknown if the error is not a *connect.Error. Useful for
// typed assertions on RPC errors.
func connectErrCode(err error) connect.Code {
	if err == nil {
		return connect.Code(0)
	}
	if cerr, ok := err.(*connect.Error); ok {
		return cerr.Code()
	}
	return connect.CodeUnknown
}
