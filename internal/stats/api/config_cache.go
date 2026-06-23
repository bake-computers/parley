package api

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const redisConfigKey = "stats:cc:v2:config"

// ConfigCache caches /v2/config in Redis or memory.
type ConfigCache struct {
	redis redis.Cmdable
	ttl   time.Duration

	mu      sync.Mutex
	mem     *Config
	memExp  time.Time
	flight  sync.Mutex
	loading bool
	waiters []chan struct{}
}

// NewConfigCache creates a cache. rdb may be nil (in-memory only).
func NewConfigCache(rdb *redis.Client, ttl time.Duration) *ConfigCache {
	if ttl <= 0 {
		ttl = 7 * time.Minute
	}
	var cmd redis.Cmdable
	if rdb != nil {
		cmd = rdb
	}
	return &ConfigCache{redis: cmd, ttl: ttl}
}

type fetchConfigFn func(ctx context.Context) (*Config, error)

// Get returns cached config or fetches via fn.
func (c *ConfigCache) Get(ctx context.Context, fn fetchConfigFn) (*Config, error) {
	if cfg, ok := c.loadRedis(ctx); ok {
		return cfg, nil
	}
	if cfg, ok := c.loadMem(); ok {
		return cfg, nil
	}
	return c.refresh(ctx, fn)
}

func (c *ConfigCache) loadRedis(ctx context.Context) (*Config, bool) {
	if c == nil || c.redis == nil {
		return nil, false
	}
	raw, err := c.redis.Get(ctx, redisConfigKey).Bytes()
	if err != nil {
		return nil, false
	}
	var cfg Config
	if json.Unmarshal(raw, &cfg) != nil {
		return nil, false
	}
	return &cfg, true
}

func (c *ConfigCache) loadMem() (*Config, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.mem != nil && time.Now().Before(c.memExp) {
		return c.mem, true
	}
	return nil, false
}

func (c *ConfigCache) refresh(ctx context.Context, fn fetchConfigFn) (*Config, error) {
	c.flight.Lock()
	if c.loading {
		ch := make(chan struct{})
		c.waiters = append(c.waiters, ch)
		c.flight.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ch:
			if cfg, ok := c.loadMem(); ok {
				return cfg, nil
			}
			return fn(ctx)
		}
	}
	c.loading = true
	c.flight.Unlock()

	cfg, err := fn(ctx)

	c.flight.Lock()
	c.loading = false
	waiters := c.waiters
	c.waiters = nil
	c.store(ctx, cfg)
	c.flight.Unlock()
	for _, ch := range waiters {
		close(ch)
	}

	if err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *ConfigCache) store(ctx context.Context, cfg *Config) {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return
	}
	if c.redis != nil {
		_ = c.redis.Set(ctx, redisConfigKey, raw, c.ttl).Err()
	}
	c.mu.Lock()
	c.mem = cfg
	c.memExp = time.Now().Add(c.ttl)
	c.mu.Unlock()
}
