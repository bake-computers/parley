package config_test

import (
	"testing"

	"github.com/bake-computers/parley/internal/config"
)

func TestLoad(t *testing.T) {
	t.Setenv("ENGINE_SERVICE_ADDR", "127.0.0.1:9999")
	t.Setenv("METRICS_ADDR", "127.0.0.1:9091")
	t.Setenv("ENGINE_SHARED_SECRET", "s3cret")
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost/db")
	t.Setenv("RUN_MIGRATIONS", "1")
	t.Setenv("DB_POOL_MAX", "16")
	t.Setenv("DB_POOL_MIN_IDLE", "2")
	t.Setenv("DB_CONNECTION_TIMEOUT_MS", "5000")
	t.Setenv("DB_IDLE_TIMEOUT_S", "120")
	t.Setenv("DB_TLS", "webpki")
	t.Setenv("DB_TLS_CA_FILE", "/tmp/ca.pem")
	t.Setenv("STATS_TTL_R6_MS", "120000")
	t.Setenv("STATS_CC_PROFILE_BATCH_SIZE", "7")
	t.Setenv("STATS_CC_PROFILE_BATCH_DELAY_MS", "1500")
	t.Setenv("PIPELINES_INGEST_URL", "https://ingest.example.com")
	t.Setenv("PIPELINES_TOKEN", "tok")
	t.Setenv("ACCOUNT_DELETION_HMAC_SECRET", "secret")
	t.Setenv("MATCHMAKING_MODEL_R2_SHA256", "0af3")
	t.Setenv("LOG_LEVEL", "debug")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.EngineServiceAddr != "127.0.0.1:9999" {
		t.Errorf("EngineServiceAddr = %q, want 127.0.0.1:9999", cfg.EngineServiceAddr)
	}
	if cfg.MetricsAddr != "127.0.0.1:9091" {
		t.Errorf("MetricsAddr = %q, want 127.0.0.1:9091", cfg.MetricsAddr)
	}
	if cfg.EngineSharedSecret != "s3cret" {
		t.Errorf("EngineSharedSecret = %q, want s3cret", cfg.EngineSharedSecret)
	}
	if cfg.DatabaseURL != "postgres://u:p@localhost/db" {
		t.Errorf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if !cfg.RunMigrations {
		t.Error("RunMigrations = false, want true")
	}
	if cfg.DBPoolMax != 16 {
		t.Errorf("DBPoolMax = %d, want 16", cfg.DBPoolMax)
	}
	if cfg.DBPoolMinIdle != 2 {
		t.Errorf("DBPoolMinIdle = %d, want 2", cfg.DBPoolMinIdle)
	}
	if cfg.DBConnectionTimeoutMS != 5000 {
		t.Errorf("DBConnectionTimeoutMS = %d, want 5000", cfg.DBConnectionTimeoutMS)
	}
	if cfg.DBIdleTimeoutS != 120 {
		t.Errorf("DBIdleTimeoutS = %d, want 120", cfg.DBIdleTimeoutS)
	}
	if cfg.DBTLS != "webpki" {
		t.Errorf("DBTLS = %q, want webpki", cfg.DBTLS)
	}
	if cfg.DBTLSCAFile != "/tmp/ca.pem" {
		t.Errorf("DBTLSCAFile = %q", cfg.DBTLSCAFile)
	}
	if cfg.StatsTTLR6MS != 120000 {
		t.Errorf("StatsTTLR6MS = %d, want 120000", cfg.StatsTTLR6MS)
	}
	if cfg.StatsCCProfileBatchSize != 7 {
		t.Errorf("StatsCCProfileBatchSize = %d, want 7", cfg.StatsCCProfileBatchSize)
	}
	if cfg.StatsCCProfileBatchDelayMS != 1500 {
		t.Errorf("StatsCCProfileBatchDelayMS = %d, want 1500", cfg.StatsCCProfileBatchDelayMS)
	}
	if cfg.PipelinesIngestURL != "https://ingest.example.com" {
		t.Errorf("PipelinesIngestURL = %q", cfg.PipelinesIngestURL)
	}
	if cfg.PipelinesToken != "tok" {
		t.Errorf("PipelinesToken = %q", cfg.PipelinesToken)
	}
	if cfg.AccountDeletionHMACSecret != "secret" {
		t.Errorf("AccountDeletionHMACSecret = %q", cfg.AccountDeletionHMACSecret)
	}
	if cfg.MatchmakingModelR2SHA256 != "0af3" {
		t.Errorf("MatchmakingModelR2SHA256 = %q, want 0af3", cfg.MatchmakingModelR2SHA256)
	}
	if cfg.LogLevel != "debug" {
		t.Errorf("LogLevel = %q, want debug", cfg.LogLevel)
	}
}

func TestLoad_defaults(t *testing.T) {
	for _, key := range []string{
		"ENGINE_SERVICE_ADDR",
		"METRICS_ADDR",
		"RUN_MIGRATIONS",
		"DB_POOL_MAX",
		"STATS_TTL_R6_MS",
		"STATS_CC_PROFILE_BATCH_SIZE",
		"STATS_CC_PROFILE_BATCH_DELAY_MS",
		"LOG_LEVEL",
		"RUST_LOG",
	} {
		t.Setenv(key, "")
	}
	// Required for boot; defaults tests still need them set.
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost/db")
	t.Setenv("MATCHMAKING_MODEL_R2_SHA256", "0af3")
	t.Setenv("ENGINE_SHARED_SECRET", "s3cret")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.EngineServiceAddr != "0.0.0.0:50051" {
		t.Errorf("EngineServiceAddr = %q", cfg.EngineServiceAddr)
	}
	if cfg.MetricsAddr != "0.0.0.0:9090" {
		t.Errorf("MetricsAddr = %q", cfg.MetricsAddr)
	}
	if cfg.RunMigrations {
		t.Error("RunMigrations should be false by default")
	}
	if cfg.DBPoolMax != 32 {
		t.Errorf("DBPoolMax = %d, want 32", cfg.DBPoolMax)
	}
	if cfg.StatsTTLR6MS != 60_000 {
		t.Errorf("StatsTTLR6MS = %d, want 60000", cfg.StatsTTLR6MS)
	}
	if cfg.StatsCCProfileBatchSize != 10 {
		t.Errorf("StatsCCProfileBatchSize = %d, want 10", cfg.StatsCCProfileBatchSize)
	}
	if cfg.StatsCCProfileBatchDelayMS != 25 {
		t.Errorf("StatsCCProfileBatchDelayMS = %d, want 25", cfg.StatsCCProfileBatchDelayMS)
	}
	if cfg.PipelinesIngestURL != "" {
		t.Errorf("PipelinesIngestURL = %q, want empty default", cfg.PipelinesIngestURL)
	}
	if cfg.PipelinesToken != "" {
		t.Errorf("PipelinesToken = %q, want empty default", cfg.PipelinesToken)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel = %q, want info", cfg.LogLevel)
	}
}

func TestLoad_RequiresDatabase(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	if _, err := config.Load(); err == nil {
		t.Fatal("Load() with empty DATABASE_URL: want error")
	}
}

func TestLoad_RequiresModelSHA256(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost/db")
	t.Setenv("ENGINE_SHARED_SECRET", "s3cret")
	t.Setenv("MATCHMAKING_MODEL_R2_SHA256", "")
	if _, err := config.Load(); err == nil {
		t.Fatal("Load() with empty MATCHMAKING_MODEL_R2_SHA256: want error")
	}
	t.Setenv("MATCHMAKING_MODEL_R2_SHA256", "  \n")
	if _, err := config.Load(); err == nil {
		t.Fatal("Load() with blank MATCHMAKING_MODEL_R2_SHA256: want error")
	}
}

func TestLoad_RequiresEngineSharedSecret(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost/db")
	t.Setenv("MATCHMAKING_MODEL_R2_SHA256", "0af3")
	t.Setenv("ENGINE_SHARED_SECRET", "")
	if _, err := config.Load(); err == nil {
		t.Fatal("Load() with empty ENGINE_SHARED_SECRET: want error")
	}
}

func TestLoad_statsCCProfileBatchClamps(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost/db")
	t.Setenv("MATCHMAKING_MODEL_R2_SHA256", "0af3")
	t.Setenv("ENGINE_SHARED_SECRET", "s3cret")
	t.Setenv("STATS_CC_PROFILE_BATCH_SIZE", "99")
	t.Setenv("STATS_CC_PROFILE_BATCH_DELAY_MS", "0")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.StatsCCProfileBatchSize != 10 {
		t.Errorf("StatsCCProfileBatchSize = %d, want 10", cfg.StatsCCProfileBatchSize)
	}
	if cfg.StatsCCProfileBatchDelayMS != 25 {
		t.Errorf("StatsCCProfileBatchDelayMS = %d, want 25", cfg.StatsCCProfileBatchDelayMS)
	}

	// 0 disables batching; delay floor is 1ms.
	t.Setenv("STATS_CC_PROFILE_BATCH_SIZE", "0")
	t.Setenv("STATS_CC_PROFILE_BATCH_DELAY_MS", "1")
	cfg, err = config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.StatsCCProfileBatchSize != 0 {
		t.Errorf("StatsCCProfileBatchSize = %d, want 0 (disabled)", cfg.StatsCCProfileBatchSize)
	}
	if cfg.StatsCCProfileBatchDelayMS != 1 {
		t.Errorf("StatsCCProfileBatchDelayMS = %d, want 1", cfg.StatsCCProfileBatchDelayMS)
	}

	// Delay ceiling avoids self-DoS via env misconfig.
	t.Setenv("STATS_CC_PROFILE_BATCH_SIZE", "5")
	t.Setenv("STATS_CC_PROFILE_BATCH_DELAY_MS", "999999")
	cfg, err = config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.StatsCCProfileBatchSize != 5 {
		t.Errorf("StatsCCProfileBatchSize = %d, want 5", cfg.StatsCCProfileBatchSize)
	}
	if cfg.StatsCCProfileBatchDelayMS != 2000 {
		t.Errorf("StatsCCProfileBatchDelayMS = %d, want 2000", cfg.StatsCCProfileBatchDelayMS)
	}
}

func TestLoad_rustLogFallback(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost/db")
	t.Setenv("MATCHMAKING_MODEL_R2_SHA256", "0af3")
	t.Setenv("ENGINE_SHARED_SECRET", "s3cret")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("RUST_LOG", "parley=warn")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.LogLevel != "parley=warn" {
		t.Errorf("LogLevel = %q, want parley=warn", cfg.LogLevel)
	}
}
