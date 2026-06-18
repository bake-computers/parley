package fetch

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/pactum-computers/parley/internal/stats/api"
)

const scraperUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// ClientOptions configures StatsClient with optional API + scraper paths.
type ClientOptions struct {
	APIKey         string
	APIBaseURL     string
	ScraperBaseURL string
	ScrapeFn       ScrapeFunc
	ConfigCache    *api.ConfigCache
	HTTPClient     *http.Client
}

// StatsClient fetches stats from stats.cc API (primary) or HTML scraper (fallback).
type StatsClient struct {
	http           *http.Client
	scraperBaseURL string
	retry          RetryPolicy
	scrape         ScrapeFunc
	api            *api.Client
}

// NewStatsClient creates a scraper-only client (backward compatible).
func NewStatsClient(baseURL string, scrapeFn ScrapeFunc) *StatsClient {
	return NewStatsClientFromOptions(ClientOptions{
		ScraperBaseURL: baseURL,
		ScrapeFn:       scrapeFn,
	})
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
		http:           httpClient,
		scraperBaseURL: opts.ScraperBaseURL,
		retry:          DefaultRetryPolicy(),
		scrape:         opts.ScrapeFn,
	}

	if opts.APIKey != "" && opts.APIBaseURL != "" {
		c.api = api.NewClient(api.Options{
			BaseURL:     opts.APIBaseURL,
			APIKey:      opts.APIKey,
			ConfigCache: opts.ConfigCache,
			HTTPClient:  httpClient,
		})
	}

	return c
}

// NewStatsClientWithHTTP creates a client with a caller-provided http.Client.
func NewStatsClientWithHTTP(baseURL string, httpClient *http.Client, scrapeFn ScrapeFunc) *StatsClient {
	return NewStatsClientFromOptions(ClientOptions{
		ScraperBaseURL: baseURL,
		ScrapeFn:       scrapeFn,
		HTTPClient:     httpClient,
	})
}

// WithRetry overrides the retry policy. Returns the same client for chaining.
func (c *StatsClient) WithRetry(r RetryPolicy) *StatsClient {
	c.retry = r
	return c
}

// Warmup pre-establishes upstream connections (API config when configured, else scraper).
func (c *StatsClient) Warmup(ctx context.Context) {
	if c.api != nil {
		if err := c.api.Warmup(ctx); err != nil {
			slog.Warn("stats api warmup failed (non-fatal)", "error", err)
			return
		}
		slog.Info("stats api connection warmed", "base", "r6.stats.cc")
		return
	}
	url := c.scraperBaseURL + "/"
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		slog.Warn("stats upstream warmup failed (non-fatal)", "url", url, "error", err)
		return
	}
	req.Header.Set("User-Agent", scraperUserAgent)
	resp, err := c.http.Do(req)
	if err != nil {
		slog.Warn("stats upstream warmup failed (non-fatal)", "url", url, "error", err)
		return
	}
	if err := resp.Body.Close(); err != nil {
		slog.Warn("stats upstream warmup body close", "error", err)
	}
	slog.Info("stats upstream connection pool warmed", "url", url)
}

// ScrapeFn returns the scrape function used by this client.
func (c *StatsClient) ScrapeFn() ScrapeFunc {
	return c.scrape
}

// APIEnabled reports whether the stats.cc API path is configured.
func (c *StatsClient) APIEnabled() bool {
	return c.api != nil
}
