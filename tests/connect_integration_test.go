//go:build integration
// +build integration

// ConnectRPC surface smoke tests for the engine-service.
package tests

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

// TestConnectRPC_PostToHealthReturns405 mirrors the defensive check: POSTing
// to the GET-only /health route must yield 405 Method Not Allowed.
func TestConnectRPC_PostToHealthReturns405(t *testing.T) {
	rig := newEngineWithDB(t)

	req, err := http.NewRequest(http.MethodPost, rig.Server.URL+"/health", nil)
	if err != nil {
		t.Fatalf("build POST /health: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("POST /health status = %d, want 405", resp.StatusCode)
	}
}

// TestConnectRPC_UnknownRouteReturns404 verifies that the mux returns
// 404 for paths that no handler has registered.
func TestConnectRPC_UnknownRouteReturns404(t *testing.T) {
	rig := newEngineWithDB(t)

	resp, err := http.Post(rig.Server.URL+"/parley.nonexistent.v1.Fake/Method", "application/json", nil)
	if err != nil {
		t.Fatalf("POST unknown route: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("unknown route status = %d, want 404", resp.StatusCode)
	}
}

// TestConnectRPC_ContentTypeOnHealth checks that the /health endpoint
// does not set a misleading content-type.
func TestConnectRPC_ContentTypeOnHealth(t *testing.T) {
	rig := newEngineWithDB(t)

	resp, err := http.Get(rig.Server.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "protobuf") || strings.Contains(ct, "grpc") {
		t.Errorf("Content-Type = %q, should not contain protobuf/grpc for plain-text health", ct)
	}
	_, _ = io.ReadAll(resp.Body)
}

// TestConnectRPC_EmptyPostToConnectEndpoint exercises the ConnectRPC
// path with an empty body against a registered service.
func TestConnectRPC_EmptyPostToConnectEndpoint(t *testing.T) {
	rig := newEngineWithDB(t)

	// Identity is wired in newEngineWithDB; empty body should not 404.
	resp, err := http.Post(
		rig.Server.URL+"/parley.identity.v1.IdentityService/LookupByDiscord",
		"application/json",
		strings.NewReader("{}"),
	)
	if err != nil {
		t.Fatalf("POST identity: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		t.Errorf("identity route status = 404, want a Connect-handled response")
	}
}
