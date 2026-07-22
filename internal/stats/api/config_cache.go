package api

import (
	"context"
	"sync"
	"time"
)

// ConfigCache caches the stats.cc /v2/config response in memory.
type ConfigCache struct {
	ttl time.Duration

	mu      sync.Mutex
	mem     *Config
	memExp  time.Time
	flight  sync.Mutex
	loading bool
	waiters []chan struct{}
}

// NewConfigCache creates an in-memory config cache with the given TTL.
// Non-positive TTLs fall back to 7 minutes.
func NewConfigCache(ttl time.Duration) *ConfigCache {
	if ttl <= 0 {
		ttl = 7 * time.Minute
	}
	return &ConfigCache{ttl: ttl}
}

type fetchConfigFn func(ctx context.Context) (*Config, error)

// Get returns cached config or fetches via fn.
func (c *ConfigCache) Get(ctx context.Context, fn fetchConfigFn) (*Config, error) {
	if cfg, ok := c.loadMem(); ok {
		return cfg, nil
	}
	return c.refresh(ctx, fn)
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
	c.store(cfg)
	c.flight.Unlock()
	for _, ch := range waiters {
		close(ch)
	}

	if err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *ConfigCache) store(cfg *Config) {
	c.mu.Lock()
	c.mem = cfg
	c.memExp = time.Now().Add(c.ttl)
	c.mu.Unlock()
}
