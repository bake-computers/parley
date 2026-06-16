package fetch

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/parley-bot/parley/internal/stats/scrape"
)

// attachResolvedTarget sets profile_id, platform, and profile_url on the collection.
func attachResolvedTarget(collection *scrape.ScrapedStatsCollection, target *resolvedProfileTarget) {
	collection.Latest.Profile.ProfileID = target.uuid
	collection.Latest.Profile.Platform = target.platform.String()
	collection.Latest.Profile.ProfileURL = target.profileURL
	for slug, stats := range collection.BySeason {
		stats.Profile.ProfileID = target.uuid
		stats.Profile.Platform = target.platform.String()
		stats.Profile.ProfileURL = target.profileURL
		collection.BySeason[slug] = stats
	}
}

// resolveProfileTarget resolves a username + platform to a canonical profile URL.
// For Auto, it searches all platforms in parallel and returns the first match.
func (c *StatsClient) resolveProfileTarget(ctx context.Context, username string, platform StatsPlatform) (*resolvedProfileTarget, string, error) {
	expected := normalizeDisplayName(username)
	order := platformSearchOrder(platform)

	if platform == StatsPlatformAuto && len(order) > 1 {
		return c.resolveProfileTargetParallel(ctx, order, expected)
	}

	for _, p := range order {
		target, body, err := c.tryResolveOne(ctx, username, p, expected, true)
		if err != nil {
			return nil, "", err
		}
		if target != nil {
			return target, body, nil
		}
	}

	return nil, "", NewStatsFetchError(StatsFetchErrorProfileNotFound, "Could not resolve profile target", false)
}

// resolveProfileTargetParallel races all platforms concurrently and returns the first hit.
func (c *StatsClient) resolveProfileTargetParallel(ctx context.Context, order []StatsPlatform, expected string) (*resolvedProfileTarget, string, error) {
	type result struct {
		target *resolvedProfileTarget
		body   string
	}

	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		lastErr error
		done    bool
		resCh   = make(chan result, len(order))
	)

	for _, p := range order {
		wg.Add(1)
		go func(p StatsPlatform) {
			defer wg.Done()
			target, body, err := c.tryResolveOne(ctx, expected, p, expected, true)
			mu.Lock()
			defer mu.Unlock()
			if done {
				return
			}
			if err != nil {
				lastErr = err
				return
			}
			if target != nil {
				done = true
				resCh <- result{target, body}
			}
		}(p)
	}

	go func() {
		wg.Wait()
		close(resCh)
	}()

	r, ok := <-resCh
	if ok && r.target != nil {
		return r.target, r.body, nil
	}

	if ctx.Err() != nil {
		return nil, "", ctx.Err()
	}
	if lastErr != nil {
		return nil, "", lastErr
	}
	return nil, "", NewStatsFetchError(StatsFetchErrorProfileNotFound, "Could not resolve profile target", false)
}

// tryResolveOne tries to resolve a profile for a single platform.
// Returns (nil, "", nil) if the platform didn't match (not an error).
func (c *StatsClient) tryResolveOne(ctx context.Context, username string, current StatsPlatform, expected string, strictNameMatch bool) (*resolvedProfileTarget, string, error) {
	base, err := url.Parse(c.baseURL + "/siege")
	if err != nil {
		return nil, "", NewStatsFetchError(StatsFetchErrorNetwork, err.Error(), false)
	}
	q := base.Query()
	q.Set("displayName", username)
	if p := current.AsQuery(); p != "" {
		q.Set("platform", p)
	}
	base.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base.String(), nil)
	if err != nil {
		return nil, "", NewStatsFetchError(StatsFetchErrorNetwork, err.Error(), false)
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", NewStatsFetchError(StatsFetchErrorNetwork, "Profile lookup request failed", true)
	}
	defer func() {
		if cerr := resp.Body.Close(); cerr != nil {
			slog.Debug("close profile lookup body", "error", cerr)
		}
	}()

	status := resp.StatusCode
	finalURL := resp.Request.URL.String()

	bodyBytes, _ := io.ReadAll(resp.Body)
	body := string(bodyBytes)

	resolvedUser, uuid, ok := parseResolvedProfileURL(finalURL)
	if !ok {
		if isRetryableStatus(status) {
			return nil, "", &StatsFetchError{
				Kind:      StatsFetchErrorHTTPStatus,
				Message:   "Profile lookup returned retryable status",
				Retryable: true,
				Status:    statusUint16(status),
			}
		}
		return nil, "", nil
	}

	if strictNameMatch {
		if !strings.EqualFold(strings.TrimSpace(resolvedUser), expected) {
			return nil, "", nil
		}
	}

	profileURL := fmt.Sprintf("%s/siege/%s/%s", c.baseURL, urlencodingEncode(resolvedUser), uuid)
	return &resolvedProfileTarget{
		username:   resolvedUser,
		uuid:       uuid,
		platform:   current,
		profileURL: profileURL,
	}, body, nil
}

func statusUint16(s int) *uint16 {
	u := uint16(s)
	return &u
}

// FetchStatsPage fetches the resolved profile page HTML for a username.
func (c *StatsClient) FetchStatsPage(ctx context.Context, username string, platform StatsPlatform) (string, error) {
	_, html, err := c.fetchStatsPageInner(ctx, username, platform)
	return html, err
}

func (c *StatsClient) fetchStatsPageInner(ctx context.Context, username string, platform StatsPlatform) (*resolvedProfileTarget, string, error) {
	target, body, err := c.resolveProfileTarget(ctx, username, platform)
	if err != nil {
		return nil, "", err
	}

	if body != "" && strings.Contains(body, "__NUXT_DATA__") {
		return target, body, nil
	}

	// Fall back to an explicit fetch for the canonical URL.
	parsed, err := url.Parse(target.profileURL)
	if err != nil {
		return nil, "", NewStatsFetchError(StatsFetchErrorNetwork, err.Error(), false)
	}
	q := parsed.Query()
	q.Set("addToRecents", "true")
	q.Set("playlist", "ranked")
	parsed.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, "", NewStatsFetchError(StatsFetchErrorNetwork, err.Error(), false)
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", NewStatsFetchError(StatsFetchErrorNetwork, "Stats page request failed", true)
	}
	defer func() {
		if cerr := resp.Body.Close(); cerr != nil {
			slog.Debug("close stats page body", "error", cerr)
		}
	}()

	status := resp.StatusCode
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", NewStatsFetchError(StatsFetchErrorNetwork, fmt.Sprintf("Failed to read response body: %v", err), true)
	}
	html := string(bodyBytes)

	isSuccess := status >= 200 && status < 300
	if !isSuccess && !strings.Contains(html, "__NUXT_DATA__") {
		return nil, "", &StatsFetchError{
			Kind:      StatsFetchErrorHTTPStatus,
			Message:   fmt.Sprintf("Stats page returned status %d", status),
			Retryable: isRetryableStatus(status),
			Status:    statusUint16(status),
		}
	}

	return target, html, nil
}

// FetchStatsCollection fetches the full multi-season collection with retry.
// Matches Rust StatsClient::fetch_stats_collection.
func (c *StatsClient) FetchStatsCollection(ctx context.Context, username string, platform StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return c.fetchWithRetry(ctx, username, platform, func() (scrape.ScrapedStatsCollection, error) {
		return c.fetchStatsCollectionOnce(ctx, username, platform)
	})
}

func (c *StatsClient) fetchStatsCollectionOnce(ctx context.Context, username string, platform StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	target, html, err := c.fetchStatsPageInner(ctx, username, platform)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, err
	}

	collection := c.scrape(html)

	looksEmpty := len(collection.SeasonCatalog) == 0 &&
		len(collection.BySeason) == 0 &&
		collection.Latest.Profile.Username == ""
	if looksEmpty {
		return scrape.ScrapedStatsCollection{}, NewStatsFetchError(StatsFetchErrorInvalidPayload, "Scraped payload was empty", true)
	}

	collection.Latest.Profile.Username = username
	for slug, stats := range collection.BySeason {
		stats.Profile.Username = username
		collection.BySeason[slug] = stats
	}

	attachResolvedTarget(&collection, target)
	return collection, nil
}

// FetchStatsCollectionWithHTML fetches the full multi-season collection along
// with the raw page HTML. Same retry semantics as FetchStatsCollection.
func (c *StatsClient) FetchStatsCollectionWithHTML(ctx context.Context, username string, platform StatsPlatform) (scrape.ScrapedStatsCollection, string, error) {
	return c.fetchWithRetryAndHTML(ctx, username, platform)
}

func (c *StatsClient) fetchWithRetryAndHTML(ctx context.Context, username string, platform StatsPlatform) (scrape.ScrapedStatsCollection, string, error) {
	var lastErr error
	backoffMS := c.retry.InitialBackoffMS

	for attempt := 0; attempt < c.retry.MaxAttempts; attempt++ {
		collection, html, err := c.fetchStatsCollectionWithHTMLOnce(ctx, username, platform)
		if err == nil {
			return collection, html, nil
		}
		lastErr = err

		fetchErr, ok := err.(*StatsFetchError)
		if !ok || !fetchErr.Retryable {
			return scrape.ScrapedStatsCollection{}, "", err
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
					return scrape.ScrapedStatsCollection{}, "", ctx.Err()
				case <-time.After(time.Duration(backoffMS) * time.Millisecond):
				}
			}
			backoffMS = min(backoffMS*2, c.retry.MaxBackoffMS)
		}
	}

	return scrape.ScrapedStatsCollection{}, "", lastErr
}

func (c *StatsClient) fetchStatsCollectionWithHTMLOnce(ctx context.Context, username string, platform StatsPlatform) (scrape.ScrapedStatsCollection, string, error) {
	target, html, err := c.fetchStatsPageInner(ctx, username, platform)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, "", err
	}

	collection := c.scrape(html)

	looksEmpty := len(collection.SeasonCatalog) == 0 &&
		len(collection.BySeason) == 0 &&
		collection.Latest.Profile.Username == ""
	if looksEmpty {
		return scrape.ScrapedStatsCollection{}, "", NewStatsFetchError(StatsFetchErrorInvalidPayload, "Scraped payload was empty", true)
	}

	collection.Latest.Profile.Username = username
	for slug, stats := range collection.BySeason {
		stats.Profile.Username = username
		collection.BySeason[slug] = stats
	}

	attachResolvedTarget(&collection, target)
	return collection, html, nil
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
	// TODO: inject CanonicalizeSeasonFunc when scrape package provides it.
	// For now, try slug match directly.
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
