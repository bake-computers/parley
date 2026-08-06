package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bake-computers/parley/internal/server"
)

const testSecret = "s3cret"

func doRequest(t *testing.T, secret string, method, target string, authHeader *string) int {
	t.Helper()
	app := server.New(server.Deps{SharedSecret: secret})
	req := httptest.NewRequest(method, target, nil)
	if authHeader != nil {
		req.Header.Set("Authorization", *authHeader)
	}
	res, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	return res.StatusCode
}

func strp(s string) *string { return &s }

func TestAuth_ProbesBypass(t *testing.T) {
	for _, path := range []string{"/health", "/ready"} {
		if got := doRequest(t, testSecret, http.MethodGet, path, nil); got != http.StatusOK {
			t.Errorf("GET %s without auth = %d, want 200", path, got)
		}
	}
}

func TestAuth_RejectsMissingOrWrongSecret(t *testing.T) {
	targets := []struct{ method, path string }{
		{http.MethodPost, "/parley.identity.v1.IdentityService/LookupByDiscord"},
		{http.MethodPost, "/parley.matchmaking.v1.MatchmakingService/ListMatches"},
		{http.MethodGet, "/stats/someone"},
	}
	for _, tt := range targets {
		if got := doRequest(t, testSecret, tt.method, tt.path, nil); got != http.StatusUnauthorized {
			t.Errorf("%s %s without auth = %d, want 401", tt.method, tt.path, got)
		}
		if got := doRequest(t, testSecret, tt.method, tt.path, strp("Bearer wrong")); got != http.StatusUnauthorized {
			t.Errorf("%s %s with wrong secret = %d, want 401", tt.method, tt.path, got)
		}
	}
}

// With the right secret the request reaches the handler; nil services
// panic into the recover middleware (500), which proves the gate passed.
func TestAuth_AcceptsSharedSecret(t *testing.T) {
	got := doRequest(t, testSecret, http.MethodPost,
		"/parley.identity.v1.IdentityService/LookupByDiscord",
		strp("Bearer "+testSecret))
	if got == http.StatusUnauthorized {
		t.Fatalf("correct secret got 401, want the request past the gate")
	}
}

// Empty secret fails closed: nothing but probes gets through.
func TestAuth_EmptySecretFailsClosed(t *testing.T) {
	got := doRequest(t, "", http.MethodPost,
		"/parley.identity.v1.IdentityService/LookupByDiscord",
		strp("Bearer "))
	if got != http.StatusUnauthorized {
		t.Fatalf("empty secret = %d, want 401", got)
	}
}

// Trailing newlines from docker env / `echo | wrangler secret put` must not
// desync edge callers that send a trimmed bearer token.
func TestAuth_TrimsSecretAndHeader(t *testing.T) {
	got := doRequest(t, testSecret+"\n", http.MethodPost,
		"/parley.identity.v1.IdentityService/LookupByDiscord",
		strp("Bearer "+testSecret))
	if got == http.StatusUnauthorized {
		t.Fatalf("trimmed secret still rejected with 401")
	}
}
