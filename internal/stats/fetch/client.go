package fetch

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/pactum-computers/parley/internal/stats/api"
)

// ClientOptions configures StatsClient (API-only).
type ClientOptions struct {
	APIKey              string
	APIBaseURL          string
	ConfigCache         *api.ConfigCache
	HTTPClient          *http.Client
	ProfileBatchSize    int
	ProfileBatchDelay   time.Duration
	DisableProfileBatch bool
}

// StatsClient fetches stats from the stats.cc API.
type StatsClient struct {
	http  *http.Client
	retry RetryPolicy
	api   *api.Client
}

// NewStatsClientFromOptions creates a client with optional API support.
func NewStatsClientFromOptions(opts ClientOptions) *StatsClient {
	httpClient := opts.HTTPClient
	if httpClient == nil {
		transport := &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   5 * time.Second,
				KeepAlive: 60 * time.Second,
			}).DialContext,
			MaxIdleConns:        8,
			MaxIdleConnsPerHost: 4,
			IdleConnTimeout:     120 * time.Second,
		}
		httpClient = &http.Client{
			Transport:     transport,
			Timeout:       12 * time.Second,
			CheckRedirect: nil,
		}
	}

	c := &StatsClient{
		http:  httpClient,
		retry: DefaultRetryPolicy(),
	}

	if opts.APIKey != "" && opts.APIBaseURL != "" {
		batchSize := opts.ProfileBatchSize
		if !opts.DisableProfileBatch && batchSize == 0 {
			batchSize = 10
		}
		c.api = api.NewClient(api.Options{
			BaseURL:             opts.APIBaseURL,
			APIKey:              opts.APIKey,
			ConfigCache:         opts.ConfigCache,
			HTTPClient:          httpClient,
			ProfileBatchSize:    batchSize,
			ProfileBatchDelay:   opts.ProfileBatchDelay,
			DisableProfileBatch: opts.DisableProfileBatch,
		})
	}

	return c
}

// WithRetry overrides the retry policy. Returns the same client for chaining.
func (c *StatsClient) WithRetry(r RetryPolicy) *StatsClient {
	c.retry = r
	return c
}

// Warmup pre-establishes API connections when configured.
func (c *StatsClient) Warmup(ctx context.Context) {
	if c.api == nil {
		slog.Warn("stats api warmup skipped: API not configured")
		return
	}
	if err := c.api.Warmup(ctx); err != nil {
		slog.Warn("stats api warmup failed (non-fatal)", "error", err)
		return
	}
	slog.Info("stats api connection warmed")
}

// APIEnabled reports whether the stats.cc API path is configured.
func (c *StatsClient) APIEnabled() bool {
	return c.api != nil
}
