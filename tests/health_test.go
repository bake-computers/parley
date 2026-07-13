//go:build integration
// +build integration

// Health and readiness smoke tests for the engine-service HTTP surface.
package tests

import (
	"io"
	"net/http"
	"testing"
)

// TestHealth_WithDB verifies GET /health returns 200 OK.
func TestHealth_WithDB(t *testing.T) {
	rig := newEngineWithDB(t)

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

// TestReady_WithDB_PingsDatabase verifies that /ready returns 200 "READY"
// when the engine has a live database connection.
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
// reject non-GET requests with 405 Method Not Allowed.
func TestHealthAndReady_MethodNotAllowed(t *testing.T) {
	rig := newEngineWithDB(t)

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
