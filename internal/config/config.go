package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds engine-service runtime settings from the process environment.
type Config struct {
	EngineServiceAddr string
	DatabaseURL       string
	RedisURL          string
	RunMigrations     bool

	DBPoolMax             uint32
	DBPoolMinIdle         uint32
	DBConnectionTimeoutMS uint64
	DBIdleTimeoutS        uint64
	DBTLS                 string
	DBTLSCAFile           string

	StatsTTLR6MS      uint64
	StatsStaleGraceMS uint64

	StatsCCAPIKey           string
	StatsCCAPIBaseURL       string
	StatsCCConfigCacheTTLMS uint64

	AxiomToken   string
	AxiomDataset string
	AxiomOrgID   string
	AxiomEdge    string
	AxiomEnabled bool

	AccountDeletionHMACSecret string

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
		EngineServiceAddr: getenv("ENGINE_SERVICE_ADDR", "0.0.0.0:50051"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		RedisURL:          os.Getenv("REDIS_URL"),
		RunMigrations:     os.Getenv("RUN_MIGRATIONS") == "1",

		DBPoolMax:             readUint32("DB_POOL_MAX", 32),
		DBPoolMinIdle:         readUint32("DB_POOL_MIN_IDLE", 0),
		DBConnectionTimeoutMS: readUint64("DB_CONNECTION_TIMEOUT_MS", 3000),
		DBIdleTimeoutS:        readUint64("DB_IDLE_TIMEOUT_S", 60),
		DBTLS:                 getenv("DB_TLS", "system"),
		DBTLSCAFile:           os.Getenv("DB_TLS_CA_FILE"),

		StatsTTLR6MS:      readUint64("STATS_TTL_R6_MS", 60_000),
		StatsStaleGraceMS: readUint64("STATS_STALE_GRACE_MS", 86_400_000),

		StatsCCAPIKey:           os.Getenv("STATS_CC_API_KEY"),
		StatsCCAPIBaseURL:       getenv("STATS_CC_API_BASE_URL", "https://r6.stats.cc"),
		StatsCCConfigCacheTTLMS: readUint64("STATS_CC_CONFIG_CACHE_TTL_MS", 420_000),

		AxiomToken:   os.Getenv("AXIOM_TOKEN"),
		AxiomDataset: getenv("AXIOM_DATASET", "parley"),
		AxiomOrgID:   os.Getenv("AXIOM_ORG_ID"),
		AxiomEdge:    os.Getenv("AXIOM_EDGE"),
		AxiomEnabled: readAxiomEnabled(),

		AccountDeletionHMACSecret: os.Getenv("ACCOUNT_DELETION_HMAC_SECRET"),

		LogLevel: readLogLevel(),
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

func readAxiomEnabled() bool {
	v, ok := os.LookupEnv("AXIOM_ENABLED")
	if !ok {
		return true
	}
	return v != "false"
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
