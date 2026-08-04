package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bake-computers/parley/internal/server"
	"github.com/bake-computers/parley/internal/services"
)

func newTestApp(t *testing.T) *server.Deps {
	t.Helper()
	return &server.Deps{
		Identity: &services.IdentityService{},
		Guild:    &services.GuildService{},
		User:     &services.UserSettingsService{},
		Match:    &services.MatchService{},
		Stats:    &services.StatsService{},
	}
}

func TestHealthEndpoint(t *testing.T) {
	deps := newTestApp(t)
	app := server.New(*deps)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "OK" {
		t.Errorf("expected 'OK', got %q", string(body))
	}
}

func TestReadyEndpoint(t *testing.T) {
	deps := newTestApp(t)
	app := server.New(*deps)

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestMetricsEndpoint(t *testing.T) {
	app := server.NewMetricsApp()

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "go_goroutines") {
		t.Errorf("expected prometheus go metrics, got: %s", body[:min(200, len(body))])
	}
}

func TestMetricsTracksRequests(t *testing.T) {
	deps := newTestApp(t)
	deps.SharedSecret = "test-secret"
	app := server.New(*deps)

	// Rejected application traffic is still traffic worth measuring. It has no
	// matched endpoint because auth stops the middleware chain, so it uses the
	// bounded "unmatched" route label.
	unauthenticated := httptest.NewRequest(http.MethodGet, "/stats/rejected", nil)
	unauthenticatedResp, err := app.Test(unauthenticated)
	if err != nil {
		t.Fatalf("unauthenticated request failed: %v", err)
	}
	_ = unauthenticatedResp.Body.Close()

	// Authenticated request reaches the route; the handler errors on the
	// zero-value service, but the metrics middleware records it either way.
	req := httptest.NewRequest(http.MethodGet, "/stats/someuser", nil)
	req.Header.Set("Authorization", "Bearer test-secret")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	_ = resp.Body.Close()

	// Connect routes are mounted as service wildcards in Fiber. The metrics
	// collector must still expose the concrete generated RPC procedure.
	rpcReq := httptest.NewRequest(
		http.MethodPost,
		"/parley.identity.v1.IdentityService/LookupByUsername",
		strings.NewReader(`{"username":"test"}`),
	)
	rpcReq.Header.Set("Authorization", "Bearer test-secret")
	rpcReq.Header.Set("Content-Type", "application/json")
	rpcResp, err := app.Test(rpcReq)
	if err != nil {
		t.Fatalf("RPC request failed: %v", err)
	}
	_ = rpcResp.Body.Close()

	scrape := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	mresp, err := server.NewMetricsApp().Test(scrape)
	if err != nil {
		t.Fatalf("scrape failed: %v", err)
	}
	defer func() { _ = mresp.Body.Close() }()
	body, _ := io.ReadAll(mresp.Body)

	want := []string{
		`parley_http_requests_total{method="GET",procedure="none",route="unmatched",status="401"} `,
		`parley_http_requests_total{method="GET",procedure="none",route="/stats/:username",status="`,
		`parley_http_request_duration_seconds_bucket{method="GET",procedure="none",route="/stats/:username"`,
		`parley_http_requests_total{method="POST",procedure="/parley.identity.v1.IdentityService/LookupByUsername",route="/parley.identity.v1.IdentityService/*",status="`,
		`parley_http_request_duration_seconds_bucket{method="POST",procedure="/parley.identity.v1.IdentityService/LookupByUsername",route="/parley.identity.v1.IdentityService/*"`,
		"parley_http_requests_in_flight 0",
	}
	for _, w := range want {
		if !strings.Contains(string(body), w) {
			t.Errorf("metrics output missing %q", w)
		}
	}
}

func TestReadyEndpointWithFailure(t *testing.T) {
	deps := newTestApp(t)
	deps.ReadyCheck = func() error {
		return fmt.Errorf("db down")
	}
	app := server.New(*deps)

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", resp.StatusCode)
	}
}

func TestIdentityServiceSmoke(t *testing.T) {
	deps := newTestApp(t)
	app := server.New(*deps)

	// Send a LookupByUsername request to verify routing works.
	// The handler will return an error (nil service), but we verify the route exists.
	body, _ := json.Marshal(map[string]string{
		"username": "test",
	})
	req := httptest.NewRequest(
		http.MethodPost,
		"/parley.identity.v1.IdentityService/LookupByUsername",
		bytes.NewReader(body),
	)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	// Should get a response (not 404) — the handler processes it.
	if resp.StatusCode == http.StatusNotFound {
		t.Error("route not found — connect service not mounted")
	}
}
