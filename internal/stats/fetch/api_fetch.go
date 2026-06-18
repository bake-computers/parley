package fetch

import (
	"context"
	"log/slog"
	"strings"
	"sync"

	"github.com/pactum-computers/parley/internal/stats/api"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

type apiResolvedProfile struct {
	id       string
	username string
	platform StatsPlatform
}

func (c *StatsClient) fetchStatsCollectionViaAPI(
	ctx context.Context,
	username string,
	platform StatsPlatform,
) (scrape.ScrapedStatsCollection, error) {
	if c.api == nil {
		return scrape.ScrapedStatsCollection{}, NewStatsFetchError(StatsFetchErrorNetwork, "api not configured", false)
	}

	target, err := c.resolveAPIProfile(ctx, username, platform)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, err
	}

	cfg, err := c.api.GetConfig(ctx)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, mapAPIError(err)
	}

	profile, err := c.api.GetProfile(ctx, target.id)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, mapAPIError(err)
	}

	playlist := cfg.Constants.Slugs.RankedPlaylist
	if playlist == "" {
		playlist = "ranked"
	}
	matches, err := c.api.ListMatches(ctx, target.id, playlist)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, mapAPIError(err)
	}

	collection := api.MapCollection(api.MapInput{
		Config:   cfg,
		Profile:  profile,
		Matches:  matches,
		Username: username,
	})

	if looksEmptyCollection(collection) {
		return scrape.ScrapedStatsCollection{}, NewStatsFetchError(StatsFetchErrorInvalidPayload, "API payload was empty", true)
	}

	slog.Debug("stats fetched via api", "username", username, "profile_id", target.id, "seasons", len(collection.SeasonCatalog))
	return collection, nil
}

func looksEmptyCollection(c scrape.ScrapedStatsCollection) bool {
	return len(c.SeasonCatalog) == 0 &&
		len(c.BySeason) == 0 &&
		c.Latest.Profile.Username == ""
}

func (c *StatsClient) resolveAPIProfile(ctx context.Context, username string, platform StatsPlatform) (*apiResolvedProfile, error) {
	expected := normalizeDisplayName(username)
	order := platformSearchOrder(platform)

	if platform == StatsPlatformAuto && len(order) > 1 {
		return c.resolveAPIProfileParallel(ctx, order, expected)
	}

	for _, p := range order {
		target, err := c.searchAPIOne(ctx, username, p, expected)
		if err != nil {
			return nil, err
		}
		if target != nil {
			return target, nil
		}
	}
	return nil, NewStatsFetchError(StatsFetchErrorProfileNotFound, "Could not resolve profile target", false)
}

func (c *StatsClient) resolveAPIProfileParallel(ctx context.Context, order []StatsPlatform, expected string) (*apiResolvedProfile, error) {
	type result struct {
		target *apiResolvedProfile
		err    error
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
			target, err := c.searchAPIOne(ctx, expected, p, expected)
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
				resCh <- result{target, nil}
			}
		}(p)
	}

	go func() {
		wg.Wait()
		close(resCh)
	}()

	r, ok := <-resCh
	if ok && r.target != nil {
		return r.target, nil
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, NewStatsFetchError(StatsFetchErrorProfileNotFound, "Could not resolve profile target", false)
}

func (c *StatsClient) searchAPIOne(ctx context.Context, username string, platform StatsPlatform, expected string) (*apiResolvedProfile, error) {
	slug := platform.AsAPISlug()
	if slug == "" {
		return nil, nil
	}
	hits, err := c.api.Search(ctx, username, slug, 10)
	if err != nil {
		return nil, mapAPIError(err)
	}
	for _, hit := range hits {
		if !strings.EqualFold(strings.TrimSpace(hit.Profile.Username), expected) {
			continue
		}
		return &apiResolvedProfile{
			id:       hit.Profile.ID,
			username: hit.Profile.Username,
			platform: platform,
		}, nil
	}
	return nil, nil
}

func mapAPIError(err error) error {
	if err == nil {
		return nil
	}
	if ae, ok := err.(*api.Error); ok {
		switch ae.Kind {
		case api.ErrNotFound, api.ErrProfileNotFound:
			return NewStatsFetchError(StatsFetchErrorProfileNotFound, ae.Message, false)
		case api.ErrParse:
			return NewStatsFetchError(StatsFetchErrorInvalidPayload, ae.Message, ae.Retryable)
		default:
			retryable := ae.Retryable || ae.ShouldFallback()
			kind := StatsFetchErrorHTTPStatus
			if ae.Kind == api.ErrNetwork {
				kind = StatsFetchErrorNetwork
			}
			fe := &StatsFetchError{
				Kind:      kind,
				Message:   ae.Message,
				Retryable: retryable,
			}
			if ae.Status > 0 {
				u := uint16(ae.Status)
				fe.Status = &u
			}
			return fe
		}
	}
	return NewStatsFetchError(StatsFetchErrorNetwork, err.Error(), true)
}

func shouldFallbackToScraper(err error) bool {
	if err == nil {
		return false
	}
	if fe, ok := err.(*StatsFetchError); ok {
		if fe.Kind == StatsFetchErrorProfileNotFound || fe.Kind == StatsFetchErrorSeasonNotFound {
			return false
		}
		return fe.Retryable
	}
	if ae, ok := err.(*api.Error); ok {
		return ae.ShouldFallback()
	}
	return true
}
