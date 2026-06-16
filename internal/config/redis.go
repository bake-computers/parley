package config

import (
	"fmt"
	"strings"

	"github.com/redis/go-redis/v9"
)

// RedisOptions parses REDIS_URL the same way as the Rust engine (redis::Client::open).
// Supports redis:// and rediss:// URLs with host, port, user, password, and DB index.
// Bare host:port values are accepted for local dev convenience.
func RedisOptions(redisURL string) (*redis.Options, error) {
	redisURL = strings.TrimSpace(redisURL)
	if redisURL == "" {
		return nil, fmt.Errorf("redis url is empty")
	}

	if strings.Contains(redisURL, "://") {
		opts, err := redis.ParseURL(redisURL)
		if err != nil {
			return nil, fmt.Errorf("parse redis url: %w", err)
		}
		return opts, nil
	}

	return &redis.Options{Addr: redisURL}, nil
}