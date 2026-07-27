package fetch

import (
	"context"
	"log/slog"
	"strings"

	"github.com/bake-computers/parley/internal/stats/api"
	"github.com/bake-computers/parley/internal/stats/scrape"
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

	// Canonicalize platform to match prior scraper path
	plat := target.platform.String()
	collection.Latest.Profile.Platform = plat

	for slug, s := range collection.BySeason {
		s.Profile.Platform = plat
		collection.BySeason[slug] = s
	}

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

	// Walk platforms sequentially. On Auto (multi-platform order) a transient
	// failure on one platform must not abort the whole resolve — keep going and
	// only surface lastErr if nothing matched.
	var lastErr error
	for _, p := range order {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		target, err := c.searchAPIOne(ctx, username, p, expected)
		if err != nil {
			lastErr = err
			continue
		}
		if target != nil {
			return target, nil
		}
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
			retryable := ae.Retryable
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
