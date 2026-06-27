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

	"github.com/pactum-computers/parley/internal/server"
	"github.com/pactum-computers/parley/internal/services"
)

func newTestApp(t *testing.T) *server.Deps {
	t.Helper()
	return &server.Deps{
		Identity:    &services.IdentityService{},
		Guild:       &services.GuildService{},
		User:        &services.UserSettingsService{},
		Leaderboard: &services.LeaderboardService{},
		Match:       &services.MatchService{},
		Stats:       &services.StatsService{},
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
	deps := newTestApp(t)
	app := server.New(*deps)

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
