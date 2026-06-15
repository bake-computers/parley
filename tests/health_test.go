//go:build integration
// +build integration

// Health and readiness smoke tests for the engine-service HTTP surface.
//
// Ported from tests/connect_integration.rs (which only covered /health in
// the Rust suite). The Go port covers both /health and /ready, with and
// without a database connection, to validate the degraded-mode behaviour
// documented in cmd/parley/main.go.
package tests

import (
	"io"
	"net/http"
	"testing"
)

// TestHealth_NoDB verifies GET /health returns 200 OK regardless of whether
// the engine has a database. /health is intentionally cheap and side-effect
// free — it should always pass.
func TestHealth_NoDB(t *testing.T) {
	rig := newEngineNoDB(t)

	resp, err := http.Get(rig.Server.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if got, want := string(body), "OK"; got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}

// TestReady_NoDB verifies that /ready returns 200 "READY" when the engine
// is started without a database. This matches the degraded-mode contract
// in cmd/parley/main.go: when bunDB is nil, /ready short-circuits to ready
// without attempting a ping.
func TestReady_NoDB(t *testing.T) {
	rig := newEngineNoDB(t)

	resp, err := http.Get(rig.Server.URL + "/ready")
	if err != nil {
		t.Fatalf("GET /ready: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if got, want := string(body), "READY"; got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}

// TestReady_WithDB_PingsDatabase verifies that /ready returns 200 "READY"
// when the engine has a live database connection. The /ready handler
// issues a trivial SELECT 1 via db.Ping before responding — a successful
// ping is the readiness signal.
func TestReady_WithDB_PingsDatabase(t *testing.T) {
	rig := newEngineWithDB(t)

	resp, err := http.Get(rig.Server.URL + "/ready")
	if err != nil {
		t.Fatalf("GET /ready: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if got, want := string(body), "READY"; got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}

// TestHealthAndReady_MethodNotAllowed verifies that the GET-only routes
// reject non-GET requests with 405 Method Not Allowed. This is defensive
// — the Go std mux returns 405 for the "GET" pattern when a different
// method is used.
func TestHealthAndReady_MethodNotAllowed(t *testing.T) {
	rig := newEngineNoDB(t)

	for _, path := range []string{"/health", "/ready"} {
		req, err := http.NewRequest(http.MethodPost, rig.Server.URL+path, nil)
		if err != nil {
			t.Fatalf("build POST %s request: %v", path, err)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("POST %s: %v", path, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("POST %s: status = %d, want 405", path, resp.StatusCode)
		}
	}
}
