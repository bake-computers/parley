package fetch

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"time"
)

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// StatsClient fetches scraped stats from stats.cc via HTTP.
// Construct one and share it across calls.
type StatsClient struct {
	http    *http.Client
	baseURL string
	retry   RetryPolicy
	scrape  ScrapeFunc
}

// NewStatsClient creates a client targeting the given base URL with default timeouts.
func NewStatsClient(baseURL string, scrapeFn ScrapeFunc) *StatsClient {
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 60 * time.Second,
		}).DialContext,
		MaxIdleConns:        8,
		MaxIdleConnsPerHost: 4,
		IdleConnTimeout:     120 * time.Second,
	}
	return &StatsClient{
		http: &http.Client{
			Transport:     transport,
			Timeout:       12 * time.Second,
			CheckRedirect: nil, // default: follow up to 10 redirects
		},
		baseURL: baseURL,
		retry:   DefaultRetryPolicy(),
		scrape:  scrapeFn,
	}
}

// NewStatsClientWithHTTP creates a client with a caller-provided http.Client.
func NewStatsClientWithHTTP(baseURL string, httpClient *http.Client, scrapeFn ScrapeFunc) *StatsClient {
	return &StatsClient{
		http:    httpClient,
		baseURL: baseURL,
		retry:   DefaultRetryPolicy(),
		scrape:  scrapeFn,
	}
}

// WithRetry overrides the retry policy. Returns the same client for chaining.
func (c *StatsClient) WithRetry(r RetryPolicy) *StatsClient {
	c.retry = r
	return c
}

// Warmup sends a HEAD request to pre-establish a TCP+TLS connection and cache
// DNS resolution. Call once at startup so the first real request skips the
// ~200-500ms connection handshake. Errors are non-fatal.
func (c *StatsClient) Warmup(ctx context.Context) {
	url := c.baseURL + "/"
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		slog.Warn("stats upstream warmup failed (non-fatal)", "url", url, "error", err)
		return
	}
	req.Header.Set("User-Agent", userAgent)
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

// ScrapeFunc returns the scrape function used by this client.
func (c *StatsClient) ScrapeFn() ScrapeFunc {
	return c.scrape
}
