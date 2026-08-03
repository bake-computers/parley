package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/bake-computers/parley/internal/config"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
)

// ErrNoDatabase is returned when an operation requires a database but none is configured.
var ErrNoDatabase = errors.New("database not configured")

// New opens a Postgres pool and wraps it with bun. DATABASE_URL must be set.
func New(ctx context.Context, cfg *config.Config) (*bun.DB, error) {
	if cfg == nil {
		return nil, fmt.Errorf("config is nil")
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
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
	idle := 60 * time.Second
	if cfg.DBIdleTimeoutS > 0 {
		idle = time.Duration(cfg.DBIdleTimeoutS) * time.Second
	}
	poolCfg.MaxConnIdleTime = idle
	poolCfg.MaxConnLifetime = 30 * time.Minute

	poolCfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	// This is a test of fixing the TLS issue on the prod server.

	// if normalizeDBTLS(cfg.DBTLS) != "none" {
	// 	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}
	// 	if err := applyTLS(cfg, tlsCfg); err != nil {
	// 		return nil, err
	// 	}
	// 	if host := poolCfg.ConnConfig.Host; host != "" {
	// 		tlsCfg.ServerName = host
	// 	}
	// 	poolCfg.ConnConfig.TLSConfig = tlsCfg
	// 	// sslmode=prefer/allow synthesizes plaintext fallback configs
	// 	// (TLSConfig=nil); point them at the same verifying config so a
	// 	// failed handshake can never silently downgrade to cleartext.
	// 	for _, fb := range poolCfg.ConnConfig.Fallbacks {
	// 		fb.TLSConfig = tlsCfg
	// 	}
	// }

	// Respect sslmode from DATABASE_URL.
	// A nil TLSConfig means sslmode=disable.
	if poolCfg.ConnConfig.TLSConfig != nil {
		tlsCfg := poolCfg.ConnConfig.TLSConfig.Clone()

		if err := applyTLS(cfg, tlsCfg); err != nil {
			return nil, fmt.Errorf("configure database TLS: %w", err)
		}

		if host := poolCfg.ConnConfig.Host; host != "" {
			tlsCfg.ServerName = host
		}

		poolCfg.ConnConfig.TLSConfig = tlsCfg
	}

	// Preserve the TLS decision for every fallback.
	// Do not create TLSConfig when pgx disabled TLS for that fallback.
	for _, fallback := range poolCfg.ConnConfig.Fallbacks {
		if fallback.TLSConfig == nil {
			continue
		}

		tlsCfg := fallback.TLSConfig.Clone()

		if err := applyTLS(cfg, tlsCfg); err != nil {
			return nil, fmt.Errorf(
				"configure database fallback TLS for %s: %w",
				fallback.Host,
				err,
			)
		}

		if fallback.Host != "" {
			tlsCfg.ServerName = fallback.Host
		}

		fallback.TLSConfig = tlsCfg
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
	sqldb.SetConnMaxIdleTime(idle)
	sqldb.SetConnMaxLifetime(poolCfg.MaxConnLifetime)
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
