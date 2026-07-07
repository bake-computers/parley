package api

import (
	"bytes"
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

	// defaultProfileBatchDelay is the coalescing window used when a caller does not
	// specify one. Kept small so a lone profile lookup is not delayed by the timer
	// (the size-based flush never fires for a single request).
	defaultProfileBatchDelay = 25 * time.Millisecond
)

// Client calls the stats.cc v2 API.
type Client struct {
	http           *http.Client
	baseURL        string
	apiKey         string
	cache          *ConfigCache
	profileBatcher *ProfileBatcher
	batchDisabled  bool
}

// Options configures a Client.
type Options struct {
	BaseURL             string
	APIKey              string
	ConfigCache         *ConfigCache
	HTTPClient          *http.Client
	ProfileBatchSize    int
	ProfileBatchDelay   time.Duration
	DisableProfileBatch bool
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
	batchSize := opts.ProfileBatchSize
	if batchSize <= 0 {
		batchSize = 10
	}
	if batchSize > 10 {
		batchSize = 10
	}
	batchDelay := opts.ProfileBatchDelay
	if batchDelay <= 0 {
		batchDelay = defaultProfileBatchDelay
	}

	c := &Client{
		http:    httpClient,
		baseURL: strings.TrimRight(opts.BaseURL, "/"),
		apiKey:  opts.APIKey,
		cache:   opts.ConfigCache,
	}
	c.batchDisabled = opts.DisableProfileBatch
	if !opts.DisableProfileBatch {
		c.profileBatcher = NewProfileBatcher(c, batchSize, batchDelay)
	}
	return c
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
	if c.profileBatcher != nil && !c.batchDisabled {
		return c.profileBatcher.Get(ctx, profileID)
	}
	return c.getProfileDirect(ctx, profileID)
}

func (c *Client) getProfileDirect(ctx context.Context, profileID string) (*Profile, error) {
	var p Profile
	path := "/v2/profiles/" + url.PathEscape(profileID)
	if err := c.getJSON(ctx, path, nil, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// BatchProfiles fetches 1-10 full profiles in one stats.cc API call.
func (c *Client) BatchProfiles(ctx context.Context, profileIDs []string) ([]Profile, error) {
	if len(profileIDs) == 0 {
		return nil, nil
	}
	if len(profileIDs) > 10 {
		return nil, &Error{Kind: ErrHTTP, Message: "profile batch size exceeds 10"}
	}
	body := struct {
		ProfileIDs []string `json:"profile_ids"`
	}{ProfileIDs: profileIDs}
	var profiles []Profile
	if err := c.postJSON(ctx, "/v2/profiles/batch", nil, body, &profiles); err != nil {
		return nil, err
	}
	return profiles, nil
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
	return c.doJSON(ctx, http.MethodGet, path, q, nil, out)
}

func (c *Client) postJSON(ctx context.Context, path string, q url.Values, body any, out any) error {
	return c.doJSON(ctx, http.MethodPost, path, q, body, out)
}

func (c *Client) doJSON(ctx context.Context, method string, path string, q url.Values, requestBody any, out any) error {
	u := c.baseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	var bodyReader io.Reader
	if requestBody != nil {
		raw, err := json.Marshal(requestBody)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, bodyReader)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", userAgent)
	if requestBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}
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
