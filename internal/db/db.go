package db

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pactum-computers/parley/internal/config"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
)

// ErrNoDatabase is returned when an operation requires a database but none is configured.
var ErrNoDatabase = errors.New("database not configured")

// New opens a Postgres pool and wraps it with bun. When cfg.DatabaseURL is empty,
// returns (nil, nil) and logs a warning (DB-less mode).
func New(ctx context.Context, cfg *config.Config) (*bun.DB, error) {
	if cfg == nil {
		return nil, fmt.Errorf("config is nil")
	}
	if cfg.DatabaseURL == "" {
		slog.Warn("DATABASE_URL unset; running without database")
		return nil, nil
	}

	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}

	poolCfg.MaxConns = int32(cfg.DBPoolMax)
	poolCfg.MinConns = int32(cfg.DBPoolMinIdle)
	if cfg.DBConnectionTimeoutMS > 0 {
		poolCfg.ConnConfig.ConnectTimeout = time.Duration(cfg.DBConnectionTimeoutMS) * time.Millisecond
	}
	if cfg.DBIdleTimeoutS > 0 {
		poolCfg.MaxConnIdleTime = time.Duration(cfg.DBIdleTimeoutS) * time.Second
	}

	poolCfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	if normalizeDBTLS(cfg.DBTLS) != "none" {
		tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}
		if err := applyTLS(cfg, tlsCfg); err != nil {
			return nil, err
		}
		if host := poolCfg.ConnConfig.Host; host != "" {
			tlsCfg.ServerName = host
		}
		poolCfg.ConnConfig.TLSConfig = tlsCfg
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create pgx pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	sqldb := stdlib.OpenDBFromPool(pool)
	db := bun.NewDB(sqldb, pgdialect.New())

	if cfg.RunMigrations {
		if err := RunMigrations(ctx, db); err != nil {
			_ = db.Close()
			pool.Close()
			return nil, fmt.Errorf("run migrations: %w", err)
		}
	}

	return db, nil
}

// Ping checks that the database can run a trivial query.
func Ping(ctx context.Context, db *bun.DB) error {
	if db == nil {
		return ErrNoDatabase
	}
	var one int
	return db.NewSelect().ColumnExpr("1").Scan(ctx, &one)
}
