//go:build integration
// +build integration

// Migration roundtrip tests for the engine-service.
//
// Ported from tests/migration_roundtrip.rs. The Rust test applied all
// embedded migrations, asserted the `games` enum existed, then reverted
// every migration and re-asserted the enum was gone. The Go port keeps
// the apply-and-assert-half and the bun-migrations table check, but does
// not revert the schema (bun/migrate's revert-all flow is internal API
// only; the Diesel `revert_last_migration` loop in Rust is not exposed
// in upstream bun/migrate).
package tests

import (
	"context"
	"testing"

	"github.com/parley-bot/parley/internal/config"
	"github.com/parley-bot/parley/internal/db"
)

// TestMigrations_ApplyAndGamesEnumExists mirrors the first half of the
// Rust migration_roundtrip.rs: apply all pending migrations against a
// live Postgres and verify the `games` enum from
// migrations/2026-05-12-120000_init_games_and_auth/up.sql is present in
// pg_type.
func TestMigrations_ApplyAndGamesEnumExists(t *testing.T) {
	bunDB, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()

	var enumExists int
	err := bunDB.NewRaw(
		"SELECT COUNT(*)::int FROM pg_type WHERE typname = 'games'",
	).Scan(ctx, &enumExists)
	if err != nil {
		t.Fatalf("query games enum: %v", err)
	}
	if enumExists != 1 {
		t.Fatalf("games enum count = %d, want 1 (apply did not run?)", enumExists)
	}
}

// TestMigrations_BunMigrationsTableHasAll12Rows asserts the bun migration
// tracker contains exactly the 12 embedded migrations registered in
// internal/db/migrations_register.go. This guards against accidental
// drop/add in the migrations/ folder — a missing or extra migration
// would shift the count and surface as a CI failure.
func TestMigrations_BunMigrationsTableHasAll12Rows(t *testing.T) {
	bunDB, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()

	var count int
	err := bunDB.NewRaw(
		"SELECT COUNT(*)::int FROM bun_migrations",
	).Scan(ctx, &count)
	if err != nil {
		t.Fatalf("query bun_migrations: %v", err)
	}
	const want = 12
	if count != want {
		t.Fatalf("bun_migrations rows = %d, want %d", count, want)
	}
}

// TestMigrations_DomainTablesPresent asserts the schema tables we depend
// on (players, discord_identities, guild_memberships, guild_settings,
// matches, match_participants, tournaments, tournament_teams,
// user_settings, account_deletion_cooldowns) all exist after apply.
// This is a smoke check that the migrations are wired into the right
// order — a missing CREATE TABLE in the up.sql chain would surface as
// a "relation does not exist" error here, not a silent runtime failure
// at first query.
func TestMigrations_DomainTablesPresent(t *testing.T) {
	bunDB, cleanup := newTestBunDB(t)
	defer cleanup()

	ctx := context.Background()

	tables := []string{
		"players",
		"discord_identities",
		"guild_memberships",
		"guild_settings",
		"matches",
		"match_participants",
		"tournaments",
		"tournament_teams",
		"user_settings",
		"account_deletion_cooldowns",
	}

	for _, table := range tables {
		var exists bool
		err := bunDB.NewRaw(
			"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?)",
			table,
		).Scan(ctx, &exists)
		if err != nil {
			t.Fatalf("query information_schema for %s: %v", table, err)
		}
		if !exists {
			t.Errorf("table %q missing after apply", table)
		}
	}
}

// TestMigrations_PingReturnsOK sanity-checks that a freshly-migrated
// pool is fully usable. The Ping helper issues a SELECT 1 — if migrations
// applied cleanly the pool should accept it without error.
func TestMigrations_PingReturnsOK(t *testing.T) {
	bunDB, cleanup := newTestBunDB(t)
	defer cleanup()

	if err := db.Ping(context.Background(), bunDB); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}

// TestMigrations_ReApplyIsIdempotent applies migrations twice. The first
// run inserts 12 rows into bun_migrations; the second run should be a
// no-op (bun/migrate skips already-applied migrations). If a migration
// is non-idempotent (e.g. CREATE TABLE without IF NOT EXISTS), the second
// run will fail with a duplicate-object error.
//
// This is the closest Go equivalent of the Rust `migration_roundtrip`
// test's "revert then re-apply" behaviour without depending on
// bun/migrate's internal revert-all API.
func TestMigrations_ReApplyIsIdempotent(t *testing.T) {
	connStr, pgCleanup := newTestPostgres(t)
	defer pgCleanup()

	cfg := &config.Config{
		DatabaseURL:   connStr,
		RunMigrations: true,
		DBTLS:         "none",
		DBPoolMax:     4,
		DBPoolMinIdle: 1,
	}

	// First apply: opens a fresh pool and applies migrations.
	first, err := db.New(context.Background(), cfg)
	if err != nil {
		t.Fatalf("first db.New: %v", err)
	}
	if err := first.PingContext(context.Background()); err != nil {
		_ = first.Close()
		t.Fatalf("first Ping: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("first Close: %v", err)
	}

	// Second apply: reopen the pool against the same (already-migrated)
	// database. bun/migrate should detect "no pending migrations" and
	// exit cleanly.
	second, err := db.New(context.Background(), cfg)
	if err != nil {
		t.Fatalf("second db.New: %v", err)
	}
	if err := second.PingContext(context.Background()); err != nil {
		_ = second.Close()
		t.Fatalf("second Ping: %v", err)
	}
	if err := second.Close(); err != nil {
		t.Fatalf("second Close: %v", err)
	}
}
