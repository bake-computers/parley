package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds engine-service runtime settings from the process environment.
type Config struct {
	EngineServiceAddr  string
	MetricsAddr        string
	EngineSharedSecret string
	DatabaseURL        string
	RunMigrations      bool

	DBPoolMax             uint32
	DBPoolMinIdle         uint32
	DBConnectionTimeoutMS uint64
	DBIdleTimeoutS        uint64
	DBTLS                 string
	DBTLSCAFile           string

	StatsTTLR6MS uint64

	StatsCCAPIKey              string
	StatsCCAPIBaseURL          string
	StatsCCConfigCacheTTLMS    uint64
	StatsCCProfileBatchSize    uint64
	StatsCCProfileBatchDelayMS uint64

	PipelinesIngestURL string
	PipelinesToken     string

	AccountDeletionHMACSecret string

	MatchmakingModelR2AccountID       string
	MatchmakingModelR2AccessKeyID     string
	MatchmakingModelR2SecretAccessKey string
	MatchmakingModelR2Bucket          string
	MatchmakingModelR2Key             string
	MatchmakingModelR2Jurisdiction    string
	MatchmakingModelR2SHA256          string
	MatchmakingModelMinSeasonMatches  int32
	MatchmakingRoleBalanceWeight      float64
	MatchmakingRoleCollisionWeight    float64

	LogLevel string
}

// Load reads optional `.env` from the working directory, then builds Config from
// environment variables. A missing `.env` file is not an error.
func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil {
		if !os.IsNotExist(err) {
			return nil, err
		}
	}

	cfg := &Config{
		EngineServiceAddr:  getenv("ENGINE_SERVICE_ADDR", "0.0.0.0:50051"),
		MetricsAddr:        getenv("METRICS_ADDR", "0.0.0.0:9090"),
		EngineSharedSecret: os.Getenv("ENGINE_SHARED_SECRET"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		RunMigrations:      os.Getenv("RUN_MIGRATIONS") == "1",

		DBPoolMax:             readUint32("DB_POOL_MAX", 32),
		DBPoolMinIdle:         readUint32("DB_POOL_MIN_IDLE", 0),
		DBConnectionTimeoutMS: readUint64("DB_CONNECTION_TIMEOUT_MS", 3000),
		DBIdleTimeoutS:        readUint64("DB_IDLE_TIMEOUT_S", 60),
		DBTLS:                 getenv("DB_TLS", "system"),
		DBTLSCAFile:           os.Getenv("DB_TLS_CA_FILE"),

		StatsTTLR6MS: readUint64("STATS_TTL_R6_MS", 60_000),

		StatsCCAPIKey:           os.Getenv("STATS_CC_API_KEY"),
		StatsCCAPIBaseURL:       getenv("STATS_CC_API_BASE_URL", "https://r6.stats.cc"),
		StatsCCConfigCacheTTLMS: readUint64("STATS_CC_CONFIG_CACHE_TTL_MS", 420_000),
		// 0 disables batching (direct GET only); 1–10 is the stats.cc batch limit.
		StatsCCProfileBatchSize: clampUint64(readUint64("STATS_CC_PROFILE_BATCH_SIZE", 10), 0, 10),
		// Keep the default coalescing window small: the stats fetch path issues one
		// GetProfile per request, so a large delay would add that latency to every
		// lookup (the size-based flush never triggers for a single request). 25ms is
		// enough to coalesce concurrent bursts (e.g. team fanout) without
		// a noticeable per-request regression. Cap at 2s so a bad env value can't
		// self-DoS profile lookups.
		StatsCCProfileBatchDelayMS: clampUint64(readMinUint64("STATS_CC_PROFILE_BATCH_DELAY_MS", 25, 1), 1, 2000),

		PipelinesIngestURL: os.Getenv("PIPELINES_INGEST_URL"),
		PipelinesToken:     os.Getenv("PIPELINES_TOKEN"),

		AccountDeletionHMACSecret: os.Getenv("ACCOUNT_DELETION_HMAC_SECRET"),

		MatchmakingModelR2AccountID:       os.Getenv("MATCHMAKING_MODEL_R2_ACCOUNT_ID"),
		MatchmakingModelR2AccessKeyID:     os.Getenv("MATCHMAKING_MODEL_R2_ACCESS_KEY_ID"),
		MatchmakingModelR2SecretAccessKey: os.Getenv("MATCHMAKING_MODEL_R2_SECRET_ACCESS_KEY"),
		MatchmakingModelR2Bucket:          getenv("MATCHMAKING_MODEL_R2_BUCKET", "ovi"),
		MatchmakingModelR2Key:             getenv("MATCHMAKING_MODEL_R2_KEY", "ovi_model.onnx"),
		MatchmakingModelR2Jurisdiction:    getenv("MATCHMAKING_MODEL_R2_JURISDICTION", "eu"),
		MatchmakingModelR2SHA256:          strings.TrimSpace(os.Getenv("MATCHMAKING_MODEL_R2_SHA256")),
		MatchmakingModelMinSeasonMatches:  int32(readUint64("MATCHMAKING_MODEL_MIN_SEASON_MATCHES", 3)),
		MatchmakingRoleBalanceWeight:      readFloat64("MATCHMAKING_ROLE_BALANCE_WEIGHT", 0.10),
		MatchmakingRoleCollisionWeight:    readFloat64("MATCHMAKING_ROLE_COLLISION_WEIGHT", 0.05),

		LogLevel: readLogLevel(),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.MatchmakingModelR2SHA256 == "" {
		return nil, fmt.Errorf("MATCHMAKING_MODEL_R2_SHA256 is required to pin the matchmaking model digest")
	}
	if cfg.EngineSharedSecret == "" {
		return nil, fmt.Errorf("ENGINE_SHARED_SECRET is required to authenticate edge callers")
	}

	return cfg, nil
}

func getenv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func readUint32(key string, defaultVal uint32) uint32 {
	v := os.Getenv(key)
	if v == "" {
		return defaultVal
	}
	n, err := strconv.ParseUint(v, 10, 32)
	if err != nil {
		return defaultVal
	}
	return uint32(n)
}

func readUint64(key string, defaultVal uint64) uint64 {
	v := os.Getenv(key)
	if v == "" {
		return defaultVal
	}
	n, err := strconv.ParseUint(v, 10, 64)
	if err != nil {
		return defaultVal
	}
	return n
}

func readFloat64(key string, defaultVal float64) float64 {
	v := os.Getenv(key)
	if v == "" {
		return defaultVal
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return defaultVal
	}
	return n
}

func readMinUint64(key string, defaultVal, minVal uint64) uint64 {
	n := readUint64(key, defaultVal)
	if n < minVal {
		return defaultVal
	}
	return n
}

func clampUint64(n, minVal, maxVal uint64) uint64 {
	if n < minVal {
		return minVal
	}
	if n > maxVal {
		return maxVal
	}
	return n
}

func readLogLevel() string {
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		return v
	}
	if v := os.Getenv("RUST_LOG"); v != "" {
		return v
	}
	return "info"
}
