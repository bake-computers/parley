package db

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// RunMigrations applies pending SQL migrations using bun/migrate.
func RunMigrations(ctx context.Context, db *bun.DB) error {
	if db == nil {
		return ErrNoDatabase
	}

	if err := ensureMigrationsRegistered(); err != nil {
		return fmt.Errorf("register migrations: %w", err)
	}

	if err := warnIfDieselMigrationsPresent(ctx, db); err != nil {
		return err
	}

	migrator := migrate.NewMigrator(db, Migrations)
	if err := migrator.Init(ctx); err != nil {
		return err
	}
	if _, err := migrator.Migrate(ctx); err != nil {
		return err
	}
	slog.Info("db migrations applied")
	return nil
}

func warnIfDieselMigrationsPresent(ctx context.Context, db *bun.DB) error {
	var exists bool
	err := db.NewSelect().
		ColumnExpr("EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '__diesel_migrations')").
		Scan(ctx, &exists)
	if err != nil {
		// Fresh database — no public schema quirks.
		return nil
	}
	if !exists {
		return nil
	}

	var dieselCount int
	err = db.NewSelect().
		TableExpr("__diesel_migrations").
		ColumnExpr("COUNT(*)").
		Scan(ctx, &dieselCount)
	if err != nil {
		return nil
	}
	if dieselCount == 0 {
		return nil
	}

	var bunCount int
	err = db.NewSelect().
		ColumnExpr("EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bun_migrations')").
		Scan(ctx, &exists)
	if err != nil {
		return nil
	}
	if exists {
		_ = db.NewSelect().TableExpr("bun_migrations").ColumnExpr("COUNT(*)").Scan(ctx, &bunCount)
	}

	if bunCount == 0 {
		slog.Warn(
			"__diesel_migrations has applied rows but bun_migrations is empty; bun migrate may re-apply schema SQL — disable RUN_MIGRATIONS on shared DB or sync migration state",
			"diesel_count", dieselCount,
		)
	}
	return nil
}
