package fetch

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// FetchStatsCollection fetches the full multi-season collection with retry.
// Matches Rust StatsClient::fetch_stats_collection.
func (c *StatsClient) FetchStatsCollection(ctx context.Context, username string, platform StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return c.fetchWithRetry(ctx, username, platform, func() (scrape.ScrapedStatsCollection, error) {
		return c.fetchStatsCollectionOnce(ctx, username, platform)
	})
}

func (c *StatsClient) fetchStatsCollectionOnce(ctx context.Context, username string, platform StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	if c.api == nil {
		return scrape.ScrapedStatsCollection{}, NewStatsFetchError(StatsFetchErrorNetwork, "stats.cc API not configured (set STATS_CC_API_KEY)", false)
	}
	return c.fetchStatsCollectionViaAPI(ctx, username, platform)
}

// FetchStats fetches a single season's stats (or latest).
// Matches Rust StatsClient::fetch_stats.
func (c *StatsClient) FetchStats(ctx context.Context, username string, platform StatsPlatform, season *string) (scrape.ScrapedStats, error) {
	collection, err := c.FetchStatsCollection(ctx, username, platform)
	if err != nil {
		return scrape.ScrapedStats{}, err
	}

	if season == nil || strings.TrimSpace(*season) == "" {
		return collection.Latest, nil
	}

	sel := strings.TrimSpace(*season)
	// Try slug match directly.
	if s, ok := collection.BySeason[sel]; ok {
		return s, nil
	}

	// Try case-insensitive slug match.
	for slug, s := range collection.BySeason {
		if strings.EqualFold(slug, sel) {
			return s, nil
		}
	}

	return scrape.ScrapedStats{}, &StatsFetchError{
		Kind:             StatsFetchErrorSeasonNotFound,
		Message:          fmt.Sprintf("Requested season %q was not found", sel),
		Retryable:        false,
		RequestedSeason:  sel,
		AvailableSeasons: collection.SeasonCatalog,
	}
}

// fetchWithRetry executes fn with exponential backoff on retryable errors.
func (c *StatsClient) fetchWithRetry(ctx context.Context, username string, platform StatsPlatform, fn func() (scrape.ScrapedStatsCollection, error)) (scrape.ScrapedStatsCollection, error) {
	var lastErr error
	backoffMS := c.retry.InitialBackoffMS

	for attempt := 0; attempt < c.retry.MaxAttempts; attempt++ {
		collection, err := fn()
		if err == nil {
			return collection, nil
		}
		lastErr = err

		fetchErr, ok := err.(*StatsFetchError)
		if !ok || !fetchErr.Retryable {
			return scrape.ScrapedStatsCollection{}, err
		}

		if attempt+1 < c.retry.MaxAttempts {
			slog.Warn("stats fetch retryable error; backing off",
				"username", username,
				"attempt", attempt+1,
				"max", c.retry.MaxAttempts,
				"backoff_ms", backoffMS,
				"error", err,
			)
			if backoffMS > 0 {
				select {
				case <-ctx.Done():
					return scrape.ScrapedStatsCollection{}, ctx.Err()
				case <-time.After(time.Duration(backoffMS) * time.Millisecond):
				}
			}
			backoffMS = min(backoffMS*2, c.retry.MaxBackoffMS)
		}
	}

	return scrape.ScrapedStatsCollection{}, lastErr
}
