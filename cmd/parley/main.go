package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bake-computers/parley/internal/config"
	"github.com/bake-computers/parley/internal/db"
	"github.com/bake-computers/parley/internal/logging"
	"github.com/bake-computers/parley/internal/matchmaking"
	"github.com/bake-computers/parley/internal/matchmaking/ovi"
	"github.com/bake-computers/parley/internal/repos"
	"github.com/bake-computers/parley/internal/server"
	"github.com/bake-computers/parley/internal/services"
	"github.com/bake-computers/parley/internal/stats/api"
	"github.com/bake-computers/parley/internal/stats/cache"
	"github.com/bake-computers/parley/internal/stats/fetch"
	"github.com/bake-computers/parley/internal/stats/persist"
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
		Level:   cfg.LogLevel,
	}
	// One Axiom handler shared by slog + domain helpers; previously New() and
	// NewAxiomHandler each created a flusher, so slog never reached the shutdown path.
	axiomHandler, err := logging.NewAxiomHandler(axiomOpts)
	logger := logging.NewWithAxiom(cfg.LogLevel, axiomHandler)
	slog.SetDefault(logger)
	if err != nil {
		slog.Warn("axiom handler init failed", "error", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	bunDB, err := db.New(ctx, cfg)
	if err != nil {
		return fmt.Errorf("database init: %w", err)
	}
	defer bunDB.Close()

	identityRepo := repos.NewIdentityRepo(bunDB)
	guildRepo := repos.NewGuildRepo(bunDB)
	matchRepo := repos.NewMatchRepo(bunDB)
	snapshotRepo := repos.NewPlayerStatSnapshotRepo(bunDB)
	userRepo := repos.NewUserSettingsRepo(bunDB)
	tournRepo := repos.NewTournamentRepo(bunDB)
	teamRepo := repos.NewTournamentTeamRepo(bunDB)
	rosterRepo := repos.NewTournamentRosterRepo(bunDB)
	bracketRepo := repos.NewBracketMatchRepo(bunDB)

	var statsConfigCache *api.ConfigCache
	if cfg.StatsCCAPIKey != "" {
		configTTL := time.Duration(cfg.StatsCCConfigCacheTTLMS) * time.Millisecond
		statsConfigCache = api.NewConfigCache(configTTL)
		slog.Info("stats.cc api enabled", "base", cfg.StatsCCAPIBaseURL)
	} else {
		slog.Warn("STATS_CC_API_KEY unset; stats fetches will fail until configured")
	}

	batchSize := int(cfg.StatsCCProfileBatchSize)
	statsClient := fetch.NewStatsClientFromOptions(fetch.ClientOptions{
		APIKey:              cfg.StatsCCAPIKey,
		APIBaseURL:          cfg.StatsCCAPIBaseURL,
		ConfigCache:         statsConfigCache,
		ProfileBatchSize:    batchSize,
		ProfileBatchDelay:   time.Duration(cfg.StatsCCProfileBatchDelayMS) * time.Millisecond,
		DisableProfileBatch: batchSize == 0,
	})

	writer := &persist.DBSnapshotWriter{
		Identity:  identityRepo,
		Snapshots: snapshotRepo,
		Guild:     guildRepo,
	}
	statsPersister := persist.NewStatsPersister(writer)

	cacheCfg := cache.NewCacheConfigFromEnv(cfg)
	snapshotStore := cache.NewSnapshotCacheStore(identityRepo, snapshotRepo, statsClient, cacheCfg)
	cacheStore := persist.NewPersistingStatsCacheStore(snapshotStore, statsPersister)

	modelClient, err := ovi.NewR2Client(ctx, cfg.MatchmakingModelR2AccountID, cfg.MatchmakingModelR2AccessKeyID, cfg.MatchmakingModelR2SecretAccessKey, cfg.MatchmakingModelR2Jurisdiction)
	if err != nil {
		return fmt.Errorf("matchmaking model client: %w", err)
	}
	model, etag, err := ovi.Load(ctx, modelClient, cfg.MatchmakingModelR2Bucket, cfg.MatchmakingModelR2Key, cfg.MatchmakingModelR2SHA256)
	if err != nil {
		return fmt.Errorf("load matchmaking model: %w", err)
	}
	slog.Info("matchmaking model loaded", "bucket", cfg.MatchmakingModelR2Bucket, "key", cfg.MatchmakingModelR2Key, "etag", etag, "sha256", model.SHA256, "features", ovi.FeatureCount, "min_season_matches", cfg.MatchmakingModelMinSeasonMatches)
	mmService := matchmaking.NewService(guildRepo, matchRepo, snapshotRepo, userRepo, model, cfg.MatchmakingModelMinSeasonMatches, cfg.MatchmakingRoleBalanceWeight, cfg.MatchmakingRoleCollisionWeight)

	identitySvc := services.NewIdentityService(identityRepo, guildRepo)
	guildSvc := services.NewGuildService(guildRepo)
	matchSvc := services.NewMatchService(matchRepo, guildRepo, mmService)
	statsSvc := services.NewStatsService(cacheStore)
	userSvc := services.NewUserSettingsService(userRepo, guildRepo, identityRepo)
	tournSvc := services.NewTournamentService(bunDB, tournRepo, teamRepo, rosterRepo, bracketRepo, mmService)

	deps := server.Deps{
		Identity:     identitySvc,
		Guild:        guildSvc,
		User:         userSvc,
		Match:        matchSvc,
		Tournament:   tournSvc,
		Stats:        statsSvc,
		SharedSecret: cfg.EngineSharedSecret,
		ReadyCheck: func() error {
			return db.Ping(ctx, bunDB)
		},
	}
	app := server.New(deps)

	go func() {
		slog.Info("stats persister started")
		statsPersister.Run(ctx)
	}()

	go statsClient.Warmup(context.Background())

	serverErr := make(chan error, 1)
	go func() {
		slog.Info("engine-service listening", "addr", cfg.EngineServiceAddr)
		if err := app.Listen(cfg.EngineServiceAddr); err != nil {
			serverErr <- err
		}
	}()

	select {
	case <-ctx.Done():
	case err := <-serverErr:
		return fmt.Errorf("server listen: %w", err)
	}
	slog.Info("shutdown signal received, draining...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		slog.Error("server shutdown error", "error", err)
	}

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
