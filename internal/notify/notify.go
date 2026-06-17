// Package notify is the engine-side notifier that posts signed JSON
// webhooks to a Cloudflare Worker dispatch endpoint after domain
// state changes. The Worker (apps/worker/src/notifications) is the
// only consumer of these payloads; this package is intentionally
// decoupled from Discord and only knows about the wire format
// defined in apps/worker/src/notifications/types.ts.
//
// Design contract:
//
//   - Dispatch is asynchronous. Callers must not observe failures.
//   - POSTs are signed with HMAC-SHA256 over the JSON body. The
//     X-Parley-Signature header is hex-encoded.
//   - The HTTP timeout is short (2s default) — never block the
//     engine on Discord-side latency.
//   - 2xx is success. 4xx is terminal (don't retry, payload is bad).
//     5xx is retried a small number of times with backoff.
//   - An empty URL yields a no-op client. Construction is always
//     safe; callers may wire the client unconditionally.
package notify

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// EventType matches the NotificationEvent union in
// apps/worker/src/notifications/types.ts.
type EventType string

const (
	EventMatchReady             EventType = "match.ready"
	EventMatchResult            EventType = "match.result"
	EventTournamentRegistration EventType = "tournament.registration_open"
	EventTournamentStarted      EventType = "tournament.started"
	EventTournamentRound        EventType = "tournament.round"
	EventTournamentChampion     EventType = "tournament.champion"
)

// Payload is the JSON body POSTed to the worker dispatch endpoint.
// Field names match the TypeScript NotifyPayload exactly.
type Payload struct {
	Event             EventType `json:"event"`
	Game              string    `json:"game"`
	MatchID           string    `json:"match_id,omitempty"`
	TournamentID      string    `json:"tournament_id,omitempty"`
	HostGuildID       string    `json:"host_guild_id"`
	PublicUUID        string    `json:"public_uuid,omitempty"`
	ParticipantGuilds []string  `json:"participant_guild_ids"`
}

// Event is the engine-side input to Dispatch. The Client converts it
// into a Payload, signs it, and POSTs asynchronously.
type Event struct {
	Event             EventType
	Game              string
	MatchID           string
	TournamentID      string
	HostGuildID       string
	PublicUUID        string
	ParticipantGuilds []string
}

// Config holds the notifier's runtime settings. An empty URL yields a
// no-op client. Timeout defaults to 2s; MaxRetries defaults to 2
// (3 attempts total).
type Config struct {
	URL        string
	Secret     string
	Timeout    time.Duration
	MaxRetries int
	HTTPClient *http.Client
	// Logger is used for warnings; nil falls back to slog.Default().
	Logger *slog.Logger
}

// DefaultTimeout is the per-attempt HTTP timeout. The contract from the
// plan: never block the engine on Discord-side latency.
const DefaultTimeout = 2 * time.Second

// DefaultMaxRetries is the number of retries AFTER the first attempt.
// 0 = no retries, 2 = 3 attempts total.
const DefaultMaxRetries = 2

// Client is the async notifier. Methods are safe for concurrent use.
type Client struct {
	cfg    Config
	wg     sync.WaitGroup
	closed chan struct{}
	once   sync.Once
}

// New returns a Client. An empty cfg.URL yields a no-op client whose
// Dispatch is a harmless no-op — useful for letting the engine run
// without a configured worker.
func New(cfg Config) *Client {
	if cfg.URL == "" {
		return &Client{closed: make(chan struct{})}
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = DefaultTimeout
	}
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = DefaultMaxRetries
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: cfg.Timeout}
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	return &Client{
		cfg:    cfg,
		closed: make(chan struct{}),
	}
}

// Shutdown waits for in-flight goroutines to finish, bounded by ctx.
func (c *Client) Shutdown(ctx context.Context) error {
	c.once.Do(func() { close(c.closed) })
	done := make(chan struct{})
	go func() {
		c.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Enabled reports whether the client is configured to send.
func (c *Client) Enabled() bool { return c.cfg.URL != "" }

// Dispatch schedules an async webhook. It returns immediately and
// never blocks the caller. A nil-safe no-op when the client has an
// empty URL.
func (c *Client) Dispatch(ctx context.Context, e Event) {
	if c == nil || c.cfg.URL == "" {
		return
	}
	payload := Payload(e)
	body, err := json.Marshal(payload)
	if err != nil {
		c.cfg.Logger.Warn("notify: marshal payload", "error", err, "event", payload.Event)
		return
	}
	c.wg.Add(1)
	go c.send(payload.Event, body)
}

// send executes the HTTP request with bounded retries. It never
// returns an error to the caller — failures are logged.
func (c *Client) send(event EventType, body []byte) {
	defer c.wg.Done()
	attempts := c.cfg.MaxRetries + 1
	delay := 100 * time.Millisecond
	for i := 0; i < attempts; i++ {
		if c.doOnce(event, body) {
			return
		}
		if i == attempts-1 {
			return
		}
		select {
		case <-c.closed:
			return
		case <-time.After(delay):
		}
		delay *= 2
	}
}

// doOnce performs one signed POST. Returns true on 2xx, false on
// retryable failure. 4xx is treated as terminal failure (returns
// false but the caller will not retry — see send).
func (c *Client) doOnce(event EventType, body []byte) bool {
	signature := signBody(c.cfg.Secret, body)
	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		c.cfg.URL,
		bytes.NewReader(body),
	)
	if err != nil {
		c.cfg.Logger.Warn("notify: build request", "error", err, "event", event)
		return true // unrecoverable; don't loop
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Parley-Signature", signature)
	req.Header.Set("X-Parley-Event", string(event))

	resp, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		c.cfg.Logger.Warn("notify: post failed", "error", err, "event", event)
		return false
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()
	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return true
	case resp.StatusCode >= 400 && resp.StatusCode < 500:
		// 4xx is terminal — payload is malformed or auth failed.
		c.cfg.Logger.Warn("notify: rejected",
			"event", event, "status", resp.StatusCode)
		return true
	default:
		c.cfg.Logger.Warn("notify: server error",
			"event", event, "status", resp.StatusCode)
		return false
	}
}

// signBody returns the hex-encoded HMAC-SHA256 of body using secret.
func signBody(secret string, body []byte) string {
	if secret == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyBody is a test/handler-side helper that recomputes the
// signature for a given body. It is exported so the worker handler
// (and our own tests) can both use the same algorithm reference.
func VerifyBody(secret string, body []byte, signature string) bool {
	if secret == "" {
		return signature == ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
