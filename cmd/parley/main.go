package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pactum-computers/parley/internal/config"
	"github.com/pactum-computers/parley/internal/db"
	"github.com/pactum-computers/parley/internal/logging"
	"github.com/pactum-computers/parley/internal/matchmaking"
	"github.com/pactum-computers/parley/internal/repos"
	"github.com/pactum-computers/parley/internal/server"
	"github.com/pactum-computers/parley/internal/services"
	"github.com/pactum-computers/parley/internal/stats/api"
	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/cache"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/persist"
	"github.com/pactum-computers/parley/internal/stats/scrape"
	"github.com/redis/go-redis/v9"
)

func main() {
	if err := run(); err != nil {
		slog.Error("engine-service failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	axiomOpts := logging.AxiomOptions{
		Token:   cfg.AxiomToken,
		Dataset: cfg.AxiomDataset,
		OrgID:   cfg.AxiomOrgID,
		Edge:    cfg.AxiomEdge,
		Enabled: cfg.AxiomEnabled,
	}
	logger := logging.New(cfg.LogLevel, axiomOpts)
	slog.SetDefault(logger)

	axiomHandler, err := logging.NewAxiomHandler(axiomOpts)
	if err != nil {
		slog.Warn("axiom handler init failed", "error", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	bunDB, err := db.New(ctx, cfg)
	if err != nil {
		return fmt.Errorf("database init: %w", err)
	}

	var (
		identityRepo *repos.IdentityRepo
		guildRepo    *repos.GuildRepo
		matchRepo    *repos.MatchRepo
		queueRepo    *repos.MatchmakingQueueRepo
		snapshotRepo *repos.PlayerStatSnapshotRepo
		userRepo     *repos.UserSettingsRepo
		tournRepo    *repos.TournamentRepo
		teamRepo     *repos.TournamentTeamRepo
		rosterRepo   *repos.TournamentRosterRepo
		bracketRepo  *repos.BracketMatchRepo
	)
	if bunDB != nil {
		identityRepo = repos.NewIdentityRepo(bunDB)
		guildRepo = repos.NewGuildRepo(bunDB)
		matchRepo = repos.NewMatchRepo(bunDB)
		queueRepo = repos.NewMatchmakingQueueRepo(bunDB)
		snapshotRepo = repos.NewPlayerStatSnapshotRepo(bunDB)
		userRepo = repos.NewUserSettingsRepo(bunDB)
		tournRepo = repos.NewTournamentRepo(bunDB)
		teamRepo = repos.NewTournamentTeamRepo(bunDB)
		rosterRepo = repos.NewTournamentRosterRepo(bunDB)
		bracketRepo = repos.NewBracketMatchRepo(bunDB)
	}

	var rdb *redis.Client
	if cfg.RedisURL != "" {
		redisOpts, err := config.RedisOptions(cfg.RedisURL)
		if err != nil {
			return fmt.Errorf("redis config: %w", err)
		}
		rdb = redis.NewClient(redisOpts)
	}

	var statsConfigCache *api.ConfigCache
	if cfg.StatsCCAPIKey != "" {
		configTTL := time.Duration(cfg.StatsCCConfigCacheTTLMS) * time.Millisecond
		statsConfigCache = api.NewConfigCache(rdb, configTTL)
		slog.Info("stats.cc api enabled", "base", cfg.StatsCCAPIBaseURL)
	} else {
		slog.Info("stats.cc api disabled (STATS_CC_API_KEY unset); using HTML scraper only")
	}

	statsClient := fetch.NewStatsClientFromOptions(fetch.ClientOptions{
		APIKey:         cfg.StatsCCAPIKey,
		APIBaseURL:     cfg.StatsCCAPIBaseURL,
		ScraperBaseURL: "https://stats.cc",
		ScrapeFn:       scrape.ScrapeHTMLStatsCollection,
		ConfigCache:    statsConfigCache,
	})

	registry := backends.NewStatsBackendRegistry()
	registry.Register(backends.NewR6Backend(statsClient))

	var cacheStore cache.CacheStore
	var statsPersister *persist.StatsPersister

	if bunDB != nil {
		writer := &persist.DBSnapshotWriter{
			Identity:  identityRepo,
			Snapshots: snapshotRepo,
			Guild:     guildRepo,
		}
		statsPersister = persist.NewStatsPersister(writer)

		if rdb != nil {
			cacheCfg := cache.NewCacheConfigFromEnv(cfg)
			redisStore := cache.NewRedisCacheStore(rdb, registry, cacheCfg, nil)
			cacheStore = persist.NewPersistingStatsCacheStore(redisStore, statsPersister)
		} else {
			directStore := cache.NewDirectCacheStore(registry)
			cacheStore = persist.NewPersistingStatsCacheStore(directStore, statsPersister)
		}
	}

	// 8. Matchmaking service.
	var mmService *matchmaking.Service
	if bunDB != nil {
		mmService = matchmaking.NewService(guildRepo, matchRepo, queueRepo, snapshotRepo, userRepo)
	}

	// 9. Domain services.
	identitySvc := services.NewIdentityService(identityRepo, guildRepo)
	guildSvc := services.NewGuildService(guildRepo)
	matchSvc := services.NewMatchService(matchRepo, queueRepo, guildRepo, mmService)
	statsSvc := services.NewStatsService(cacheStore, registry)
	userSvc := services.NewUserSettingsService(userRepo, guildRepo, identityRepo)

	var leaderboardStore services.Store
	if rdb != nil {
		leaderboardStore = services.NewRedisStore(rdb)
	}
	leaderboardSvc := services.NewLeaderboardService(leaderboardStore)

	var tournSvc *services.TournamentService
	if bunDB != nil {
		tournSvc = services.NewTournamentService(bunDB, tournRepo, teamRepo, rosterRepo, bracketRepo, mmService)
	}

	// 9. Build Fiber app via server package.
	deps := server.Deps{
		Identity:    identitySvc,
		Guild:       guildSvc,
		User:        userSvc,
		Leaderboard: leaderboardSvc,
		Match:       matchSvc,
		Tournament:  tournSvc,
		Stats:       statsSvc,
		ReadyCheck: func() error {
			if bunDB != nil {
				return db.Ping(ctx, bunDB)
			}
			return nil
		},
	}
	app := server.New(deps)

	// 10. Start background goroutines.
	if mmService != nil && bunDB != nil {
		go func() {
			slog.Info("matchmaking sweeper started")
			if err := mmService.Run(ctx, 5*time.Second); err != nil && !errors.Is(err, context.Canceled) {
				slog.Error("sweeper exited with error", "error", err)
			}
		}()
	}

	if statsPersister != nil {
		go func() {
			slog.Info("stats persister started")
			statsPersister.Run(ctx)
		}()
	}

	// Async warmup: pre-establish TCP+TLS to stats.cc.
	go statsClient.Warmup(context.Background())

	// 11. Start Fiber server (Listen blocks until shutdown).
	serverErr := make(chan error, 1)
	go func() {
		slog.Info("engine-service listening", "addr", cfg.EngineServiceAddr)
		if err := app.Listen(cfg.EngineServiceAddr); err != nil {
			serverErr <- err
		}
	}()

	// 12. Wait for shutdown signal or unexpected server exit.
	select {
	case <-ctx.Done():
	case err := <-serverErr:
		return fmt.Errorf("server listen: %w", err)
	}
	slog.Info("shutdown signal received, draining...")

	// Give in-flight requests 10s to complete.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		slog.Error("server shutdown error", "error", err)
	}

	if bunDB != nil {
		_ = bunDB.Close()
	}
	if rdb != nil {
		_ = rdb.Close()
	}

	// Flush Axiom logs.
	if axiomHandler != nil {
		axiomCtx, axiomCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer axiomCancel()
		if err := axiomHandler.Shutdown(axiomCtx); err != nil {
			slog.Warn("axiom shutdown error", "error", err)
		}
	}

	slog.Info("engine-service stopped")
	return nil
}
