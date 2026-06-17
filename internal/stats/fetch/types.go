package fetch

import "github.com/pactum-computers/parley/internal/stats/scrape"

// RetryPolicy configures retry behaviour for retryable upstream errors (429, 5xx, network).
type RetryPolicy struct {
	MaxAttempts      int
	InitialBackoffMS int64
	MaxBackoffMS     int64
}

// DefaultRetryPolicy returns the default retry configuration (2 attempts, 200ms initial backoff).
func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{
		MaxAttempts:      2,
		InitialBackoffMS: 200,
		MaxBackoffMS:     2000,
	}
}

// NoRetryPolicy disables retries entirely. Used by tests that want deterministic
// single-shot behaviour.
func NoRetryPolicy() RetryPolicy {
	return RetryPolicy{
		MaxAttempts:      1,
		InitialBackoffMS: 0,
		MaxBackoffMS:     0,
	}
}

// ScrapeFunc parses HTML into a ScrapedStatsCollection.
// Injected dependency — the actual implementation lives in the scrape package.
type ScrapeFunc func(html string) scrape.ScrapedStatsCollection

// CanonicalizeSeasonFunc resolves a season selector (slug or display name) to
// its canonical slug, or returns empty string if not found.
type CanonicalizeSeasonFunc func(selector string, catalog []scrape.SeasonCatalogEntry) string
