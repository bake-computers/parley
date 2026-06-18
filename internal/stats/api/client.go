package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const userAgent = "parley.bot"

const (
	defaultTimeout = 12 * time.Second
	maxMatchPages  = 3
	matchesPerPage = 20
)

// Client calls the stats.cc v2 API.
type Client struct {
	http    *http.Client
	baseURL string
	apiKey  string
	cache   *ConfigCache
}

// Options configures a Client.
type Options struct {
	BaseURL     string
	APIKey      string
	ConfigCache *ConfigCache
	HTTPClient  *http.Client
}

// NewClient returns an API client. baseURL should be https://r6.stats.cc.
func NewClient(opts Options) *Client {
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
			Transport: transport,
			Timeout:   defaultTimeout,
		}
	}
	return &Client{
		http:    httpClient,
		baseURL: strings.TrimRight(opts.BaseURL, "/"),
		apiKey:  opts.APIKey,
		cache:   opts.ConfigCache,
	}
}

// Warmup pre-establishes a connection to the API (non-fatal on error).
func (c *Client) Warmup(ctx context.Context) error {
	if c.cache != nil {
		_, err := c.cache.Get(ctx, c.fetchConfig)
		return err
	}
	_, err := c.fetchConfig(ctx)
	return err
}

// GetConfig returns cached or fresh /v2/config.
func (c *Client) GetConfig(ctx context.Context) (*Config, error) {
	if c.cache != nil {
		return c.cache.Get(ctx, c.fetchConfig)
	}
	return c.fetchConfig(ctx)
}

func (c *Client) fetchConfig(ctx context.Context) (*Config, error) {
	var cfg Config
	if err := c.getJSON(ctx, "/v2/config", nil, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// Search searches profiles by username on one platform.
func (c *Client) Search(ctx context.Context, username, platform string, limit int) ([]SearchHit, error) {
	q := url.Values{}
	q.Set("username", username)
	q.Set("platform", platform)
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	var hits []SearchHit
	if err := c.getJSON(ctx, "/v2/profiles/search", q, &hits); err != nil {
		return nil, err
	}
	return hits, nil
}

// GetProfile fetches a full profile by ID.
func (c *Client) GetProfile(ctx context.Context, profileID string) (*Profile, error) {
	var p Profile
	path := "/v2/profiles/" + url.PathEscape(profileID)
	if err := c.getJSON(ctx, path, nil, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// ListMatches fetches ranked matches for KOST round stats (capped pagination).
func (c *Client) ListMatches(ctx context.Context, profileID, playlist string) ([]Match, error) {
	var all []Match
	for page := 0; page < maxMatchPages; page++ {
		q := url.Values{}
		q.Set("playlist", playlist)
		q.Set("limit", strconv.Itoa(matchesPerPage))
		q.Set("offset", strconv.Itoa(page*matchesPerPage))
		var batch []Match
		path := "/v2/profiles/" + url.PathEscape(profileID) + "/matches"
		if err := c.getJSON(ctx, path, q, &batch); err != nil {
			return nil, err
		}
		all = append(all, batch...)
		if len(batch) < matchesPerPage {
			break
		}
	}
	return all, nil
}

// ListSessions fetches ranked sessions (secondary source when matches lack summaries).
func (c *Client) ListSessions(ctx context.Context, profileID, playlist string, limit int) ([]Session, error) {
	q := url.Values{}
	q.Set("playlist", playlist)
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	var sessions []Session
	path := "/v2/profiles/" + url.PathEscape(profileID) + "/sessions"
	if err := c.getJSON(ctx, path, q, &sessions); err != nil {
		return nil, err
	}
	return sessions, nil
}

func (c *Client) getJSON(ctx context.Context, path string, q url.Values, out any) error {
	u := c.baseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", userAgent)
	if c.apiKey != "" {
		req.Header.Set("X-Api-Key", c.apiKey)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return &Error{Kind: ErrNetwork, Status: 0, Message: err.Error(), Retryable: true}
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return &Error{Kind: ErrNetwork, Status: resp.StatusCode, Message: "read body", Retryable: true}
	}

	if resp.StatusCode == http.StatusNotFound {
		return &Error{Kind: ErrNotFound, Status: resp.StatusCode, Message: string(body)}
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return &Error{Kind: ErrAuth, Status: resp.StatusCode, Message: string(body), Retryable: true}
	}
	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
		return &Error{Kind: ErrHTTP, Status: resp.StatusCode, Message: string(body), Retryable: true}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &Error{Kind: ErrHTTP, Status: resp.StatusCode, Message: string(body)}
	}

	if err := json.Unmarshal(body, out); err != nil {
		return &Error{Kind: ErrParse, Status: resp.StatusCode, Message: err.Error(), Retryable: true}
	}
	return nil
}
