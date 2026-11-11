package fetch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"testing"
)

func apiTestdata(t *testing.T, name string) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	// fetch tests live in internal/stats/fetch; testdata is sibling api/testdata
	return filepath.Join(filepath.Dir(file), "..", "api", "testdata", name)
}

func mockAPIServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/v2/config", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, apiTestdata(t, "config.json"))
	})
	mux.HandleFunc("/v2/profiles/search", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, apiTestdata(t, "search.json"))
	})
	mux.HandleFunc("/v2/profiles/00000000-0000-4000-8000-000000000001", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, apiTestdata(t, "profile.json"))
	})
	mux.HandleFunc("/v2/profiles/00000000-0000-4000-8000-000000000001/matches", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, apiTestdata(t, "matches.json"))
	})
	return httptest.NewServer(mux)
}

func TestFetchStatsCollection_APINotConfigured(t *testing.T) {
	c := NewStatsClientFromOptions(ClientOptions{}).WithRetry(NoRetryPolicy())
	_, err := c.FetchStatsCollection(context.Background(), "SamplePlayer", StatsPlatformPC)
	if err == nil {
		t.Fatal("expected error")
	}
	fe, ok := err.(*StatsFetchError)
	if !ok || fe.Retryable {
		t.Fatalf("want non-retryable StatsFetchError, got %v", err)
	}
}

func TestFetchStatsCollection_HappyPath(t *testing.T) {
	srv := mockAPIServer(t)
	defer srv.Close()
	c := NewStatsClientFromOptions(ClientOptions{
		APIKey:              "k",
		APIBaseURL:          srv.URL,
		HTTPClient:          srv.Client(),
		DisableProfileBatch: true,
	}).WithRetry(NoRetryPolicy())
	col, err := c.FetchStatsCollection(context.Background(), "SamplePlayer", StatsPlatformPC)
	if err != nil {
		t.Fatal(err)
	}
	if col.Latest.Profile.ProfileID == "" {
		t.Fatal("missing profile id")
	}
	if col.Latest.Profile.Platform != "pc" {
		t.Fatalf("platform = %q", col.Latest.Profile.Platform)
	}
	if len(col.SeasonCatalog) == 0 {
		t.Fatal("empty catalog")
	}
}

func TestFetchStatsCollection_ProfileNotFound(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v2/profiles/search", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	})
	mux.HandleFunc("/v2/config", func(w http.ResponseWriter, _ *http.Request) {
		t.Error("config should not be called")
		http.Error(w, "no", 500)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := NewStatsClientFromOptions(ClientOptions{
		APIKey: "k", APIBaseURL: srv.URL, HTTPClient: srv.Client(), DisableProfileBatch: true,
	}).WithRetry(NoRetryPolicy())
	_, err := c.FetchStatsCollection(context.Background(), "Nobody", StatsPlatformPC)
	if err == nil {
		t.Fatal("expected not found")
	}
	fe, ok := err.(*StatsFetchError)
	if !ok || fe.Kind != StatsFetchErrorProfileNotFound {
		t.Fatalf("got %v", err)
	}
}

func TestFetchStatsCollection_RetryableThenFail(t *testing.T) {
	var hits int32
	mux := http.NewServeMux()
	mux.HandleFunc("/v2/profiles/search", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		http.Error(w, "nope", http.StatusBadGateway)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := NewStatsClientFromOptions(ClientOptions{
		APIKey: "k", APIBaseURL: srv.URL, HTTPClient: srv.Client(), DisableProfileBatch: true,
	}).WithRetry(RetryPolicy{MaxAttempts: 2, InitialBackoffMS: 1, MaxBackoffMS: 2})
	_, err := c.FetchStatsCollection(context.Background(), "SamplePlayer", StatsPlatformPC)
	if err == nil {
		t.Fatal("expected error")
	}
	if atomic.LoadInt32(&hits) < 2 {
		t.Fatalf("hits=%d want >=2", hits)
	}
}

func TestFetchStats_SeasonSelector(t *testing.T) {
	srv := mockAPIServer(t)
	defer srv.Close()
	c := NewStatsClientFromOptions(ClientOptions{
		APIKey: "k", APIBaseURL: srv.URL, HTTPClient: srv.Client(), DisableProfileBatch: true,
	}).WithRetry(NoRetryPolicy())
	col, err := c.FetchStatsCollection(context.Background(), "SamplePlayer", StatsPlatformPC)
	if err != nil {
		t.Fatal(err)
	}
	if len(col.BySeason) == 0 {
		t.Fatal("no seasons")
	}
	var slug string
	for s := range col.BySeason {
		slug = s
		break
	}
	got, err := c.FetchStats(context.Background(), "SamplePlayer", StatsPlatformPC, &slug)
	if err != nil {
		t.Fatal(err)
	}
	if got.RankedStats.SeasonSlug != slug && got.RankedStats.Season != slug {
		if got.Profile.Username == "" && got.Profile.ProfileID == "" {
			t.Fatalf("empty stats for season %s", slug)
		}
	}
	missing := "no-such-season-xyz"
	_, err = c.FetchStats(context.Background(), "SamplePlayer", StatsPlatformPC, &missing)
	if err == nil {
		t.Fatal("expected season not found")
	}
	fe, ok := err.(*StatsFetchError)
	if !ok || fe.Kind != StatsFetchErrorSeasonNotFound {
		t.Fatalf("got %v", err)
	}
}

func TestStatsPlatform_AsAPISlug(t *testing.T) {
	if StatsPlatformPC.AsAPISlug() != "pc" {
		t.Fatal()
	}
	if StatsPlatformPlaystation.AsAPISlug() != "psn" {
		t.Fatal()
	}
	if StatsPlatformAuto.AsAPISlug() != "" {
		t.Fatal()
	}
}

func TestStatsPlatform_AsQuery(t *testing.T) {
	if StatsPlatformPC.AsQuery() != "pc" {
		t.Fatal()
	}
	if StatsPlatformPlaystation.AsQuery() != "playstation" {
		t.Fatal()
	}
	if StatsPlatformAuto.AsQuery() != "" {
		t.Fatal()
	}
}

func TestStatsPlatform_String(t *testing.T) {
	if StatsPlatformAuto.String() != "auto" {
		t.Fatal()
	}
	if StatsPlatformPC.String() != "pc" {
		t.Fatal()
	}
	if StatsPlatformPlaystation.String() != "playstation" {
		t.Fatal()
	}
}

func TestStatsFetchErrorKind_String(t *testing.T) {
	tests := []struct {
		kind StatsFetchErrorKind
		want string
	}{
		{StatsFetchErrorNetwork, "Network"},
		{StatsFetchErrorHTTPStatus, "HttpStatus"},
		{StatsFetchErrorProfileNotFound, "ProfileNotFound"},
		{StatsFetchErrorInvalidPayload, "InvalidPayload"},
		{StatsFetchErrorSeasonNotFound, "SeasonNotFound"},
		{StatsFetchErrorGcUnavailable, "GcUnavailable"},
		{StatsFetchErrorKind(99), "Unknown"},
	}
	for _, tt := range tests {
		if got := tt.kind.String(); got != tt.want {
			t.Errorf("StatsFetchErrorKind(%d).String() = %q, want %q", tt.kind, got, tt.want)
		}
	}
}

func TestStatsFetchError_Error(t *testing.T) {
	err := NewStatsFetchError(StatsFetchErrorNetwork, "test error", true)
	if err.Kind != StatsFetchErrorNetwork {
		t.Fatalf("kind = %v", err.Kind)
	}
	if !err.Retryable {
		t.Fatal("expected retryable")
	}
	if err.Error() == "" {
		t.Fatal("empty Error()")
	}
}
