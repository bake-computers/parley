package fetch

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/parley-bot/parley/internal/stats/scrape"
)

// --- Unit tests for helpers ---

func TestUUIDRegex(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee", true},
		{"AAAAAAAA-BBBB-4CCC-9DDD-EEEEEEEEEEEE", true},
		{"12345678-1234-4234-9234-123456789abc", true},
		{"not-a-uuid", false},
		{"", false},
		{"aaaaaaaa-bbbb-0ccc-9ddd-eeeeeeeeeeee", false},  // version 0 invalid
		{"aaaaaaaa-bbbb-4ccc-0ddd-eeeeeeeeeeee", false},  // variant 0 invalid
		{"aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeee", false},   // too short
		{"aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeeee", false}, // too long
		{"gggggggg-bbbb-4ccc-9ddd-eeeeeeeeeeee", false},  // invalid hex
	}
	for _, tt := range tests {
		got := uuidRegex().MatchString(tt.input)
		if got != tt.want {
			t.Errorf("uuidRegex(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestParseResolvedProfileURL(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		username string
		uuid     string
		ok       bool
	}{
		{
			name:     "valid with percent-encoded username",
			url:      "https://stats.cc/siege/Some%20Player/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
			username: "Some Player",
			uuid:     "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
			ok:       true,
		},
		{
			name:     "valid plain username",
			url:      "https://stats.cc/siege/TestUser/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
			username: "TestUser",
			uuid:     "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
			ok:       true,
		},
		{
			name: "invalid - no uuid",
			url:  "https://stats.cc/siege/TestUser/not-a-uuid",
			ok:   false,
		},
		{
			name: "invalid - wrong path prefix",
			url:  "https://stats.cc/other/TestUser/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
			ok:   false,
		},
		{
			name: "invalid - too few path segments",
			url:  "https://stats.cc/siege/TestUser",
			ok:   false,
		},
		{
			name: "invalid - empty username",
			url:  "https://stats.cc/siege//aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
			ok:   false,
		},
		{
			name: "invalid - malformed url",
			url:  "://invalid",
			ok:   false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			username, uuid, ok := parseResolvedProfileURL(tt.url)
			if ok != tt.ok {
				t.Fatalf("parseResolvedProfileURL(%q) ok = %v, want %v", tt.url, ok, tt.ok)
			}
			if ok {
				if username != tt.username {
					t.Errorf("username = %q, want %q", username, tt.username)
				}
				if uuid != tt.uuid {
					t.Errorf("uuid = %q, want %q", uuid, tt.uuid)
				}
			}
		})
	}
}

func TestPercentDecode(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"a%20b", "a b"},
		{"hello", "hello"},
		{"%E4%B8%AD%E6%96%87", "中文"},
		{"a%2Fb", "a/b"},
	}
	for _, tt := range tests {
		got, err := percentDecode(tt.input)
		if err != nil {
			t.Errorf("percentDecode(%q) error: %v", tt.input, err)
			continue
		}
		if got != tt.want {
			t.Errorf("percentDecode(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestURLEncodingEncode(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"hello", "hello"},
		{"Some Player", "Some%20Player"},
		{"a+b", "a%2Bb"},
		{"test-user_1.0", "test-user_1.0"},
		{"100%", "100%25"},
	}
	for _, tt := range tests {
		got := urlencodingEncode(tt.input)
		if got != tt.want {
			t.Errorf("urlencodingEncode(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestIsRetryableStatus(t *testing.T) {
	tests := []struct {
		status int
		want   bool
	}{
		{200, false},
		{404, false},
		{429, true},
		{500, true},
		{502, true},
		{503, true},
		{301, false},
	}
	for _, tt := range tests {
		got := isRetryableStatus(tt.status)
		if got != tt.want {
			t.Errorf("isRetryableStatus(%d) = %v, want %v", tt.status, got, tt.want)
		}
	}
}

func TestNormalizeDisplayName(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"  TestUser  ", "testuser"},
		{"UPPER", "upper"},
		{"MiXeD", "mixed"},
	}
	for _, tt := range tests {
		got := normalizeDisplayName(tt.input)
		if got != tt.want {
			t.Errorf("normalizeDisplayName(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestPlatformSearchOrder(t *testing.T) {
	autoOrder := platformSearchOrder(StatsPlatformAuto)
	if len(autoOrder) != 3 {
		t.Errorf("auto order length = %d, want 3", len(autoOrder))
	}
	pcOrder := platformSearchOrder(StatsPlatformPC)
	if len(pcOrder) != 1 || pcOrder[0] != StatsPlatformPC {
		t.Errorf("pc order = %v, want [PC]", pcOrder)
	}
}

func TestPlatformAsQuery(t *testing.T) {
	tests := []struct {
		p    StatsPlatform
		want string
	}{
		{StatsPlatformAuto, ""},
		{StatsPlatformPC, "pc"},
		{StatsPlatformXbox, "xbox"},
		{StatsPlatformPlaystation, "playstation"},
	}
	for _, tt := range tests {
		got := tt.p.AsQuery()
		if got != tt.want {
			t.Errorf("StatsPlatform(%d).AsQuery() = %q, want %q", tt.p, got, tt.want)
		}
	}
}

func TestPlatformString(t *testing.T) {
	tests := []struct {
		p    StatsPlatform
		want string
	}{
		{StatsPlatformAuto, "auto"},
		{StatsPlatformPC, "pc"},
		{StatsPlatformXbox, "xbox"},
		{StatsPlatformPlaystation, "playstation"},
	}
	for _, tt := range tests {
		got := tt.p.String()
		if got != tt.want {
			t.Errorf("StatsPlatform(%d).String() = %q, want %q", tt.p, got, tt.want)
		}
	}
}

func TestRetryPolicy(t *testing.T) {
	def := DefaultRetryPolicy()
	if def.MaxAttempts != 2 {
		t.Errorf("DefaultRetryPolicy.MaxAttempts = %d, want 2", def.MaxAttempts)
	}
	if def.InitialBackoffMS != 200 {
		t.Errorf("DefaultRetryPolicy.InitialBackoffMS = %d, want 200", def.InitialBackoffMS)
	}

	no := NoRetryPolicy()
	if no.MaxAttempts != 1 {
		t.Errorf("NoRetryPolicy.MaxAttempts = %d, want 1", no.MaxAttempts)
	}
}

func TestStatsFetchError(t *testing.T) {
	err := NewStatsFetchError(StatsFetchErrorNetwork, "test error", true)
	if err.Kind != StatsFetchErrorNetwork {
		t.Errorf("Kind = %v, want Network", err.Kind)
	}
	if !err.Retryable {
		t.Error("Retryable should be true")
	}
	if !strings.Contains(err.Error(), "Network") {
		t.Errorf("Error() = %q, should contain Network", err.Error())
	}
}

func TestStatsFetchErrorKindString(t *testing.T) {
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
		got := tt.kind.String()
		if got != tt.want {
			t.Errorf("StatsFetchErrorKind(%d).String() = %q, want %q", tt.kind, got, tt.want)
		}
	}
}

// --- Integration tests with httptest.Server ---

func noopScrape(_ string) scrape.ScrapedStatsCollection {
	return scrape.ScrapedStatsCollection{
		Latest:        scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "testuser", Level: 100}},
		BySeason:      map[string]scrape.ScrapedStats{},
		SeasonCatalog: []scrape.SeasonCatalogEntry{},
	}
}

func nuxtScrape(_ string) scrape.ScrapedStatsCollection {
	return scrape.ScrapedStatsCollection{
		Latest: scrape.ScrapedStats{
			Profile:     scrape.StatsProfile{Username: "testuser", Level: 100},
			RankedStats: scrape.RankedStats{Kills: 500, Deaths: 200},
		},
		BySeason: map[string]scrape.ScrapedStats{
			"y10s1": {
				Profile:     scrape.StatsProfile{Username: "testuser", Level: 100},
				RankedStats: scrape.RankedStats{Season: "Y10S1", Kills: 250, Deaths: 100},
			},
		},
		SeasonCatalog: []scrape.SeasonCatalogEntry{
			{Slug: "y10s1", Display: "Year 10 Season 1", StartedAt: "2025-01-01"},
		},
	}
}

const validUUID = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee"

func TestFetchStatsCollection_Success(t *testing.T) {
	var profileHits int32

	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("displayName")
		if name == "" {
			http.Error(w, "missing displayName", http.StatusBadRequest)
			return
		}
		atomic.AddInt32(&profileHits, 1)
		// Redirect to the profile URL with the body containing __NUXT_DATA__.
		redirectURL := fmt.Sprintf("/siege/%s/%s", name, validUUID)
		http.Redirect(w, r, redirectURL, http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/testuser/%s", validUUID), func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprintf(w, `<html><body><script id="__NUXT_DATA__" type="application/json">[1,"data"]</script></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewStatsClient(srv.URL, nuxtScrape).WithRetry(NoRetryPolicy())
	collection, err := client.FetchStatsCollection(context.Background(), "testuser", StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchStatsCollection() error: %v", err)
	}

	if collection.Latest.Profile.Username != "testuser" {
		t.Errorf("username = %q, want testuser", collection.Latest.Profile.Username)
	}
	if collection.Latest.Profile.ProfileID != validUUID {
		t.Errorf("profile_id = %q, want %q", collection.Latest.Profile.ProfileID, validUUID)
	}
	if collection.Latest.Profile.Platform != "pc" {
		t.Errorf("platform = %q, want pc", collection.Latest.Profile.Platform)
	}
	if hits := atomic.LoadInt32(&profileHits); hits != 1 {
		t.Errorf("profile hits = %d, want 1", hits)
	}
}

func TestFetchStatsCollection_EmptyPayload_Retries(t *testing.T) {
	var attempts int32

	emptyScrape := func(_ string) scrape.ScrapedStatsCollection {
		return scrape.ScrapedStatsCollection{}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		http.Redirect(w, r, fmt.Sprintf("/siege/testuser/%s", validUUID), http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/testuser/%s", validUUID), func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, `<html><body></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	retry := RetryPolicy{MaxAttempts: 3, InitialBackoffMS: 1, MaxBackoffMS: 10}
	client := NewStatsClient(srv.URL, emptyScrape).WithRetry(retry)
	_, err := client.FetchStatsCollection(context.Background(), "testuser", StatsPlatformPC)
	if err == nil {
		t.Fatal("expected error for empty payload")
	}
	fetchErr, ok := err.(*StatsFetchError)
	if !ok {
		t.Fatalf("error type = %T, want *StatsFetchError", err)
	}
	if fetchErr.Kind != StatsFetchErrorInvalidPayload {
		t.Errorf("error kind = %v, want InvalidPayload", fetchErr.Kind)
	}
	if n := atomic.LoadInt32(&attempts); n != 3 {
		t.Errorf("attempts = %d, want 3", n)
	}
}

func TestFetchStatsCollection_ServerError_Retries(t *testing.T) {
	var attempts int32

	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&attempts, 1)
		if n < 3 {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		http.Redirect(w, r, fmt.Sprintf("/siege/testuser/%s", validUUID), http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/testuser/%s", validUUID), func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, `<html><body><script id="__NUXT_DATA__">[]</script></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	retry := RetryPolicy{MaxAttempts: 3, InitialBackoffMS: 1, MaxBackoffMS: 10}
	client := NewStatsClient(srv.URL, nuxtScrape).WithRetry(retry)
	collection, err := client.FetchStatsCollection(context.Background(), "testuser", StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchStatsCollection() error: %v", err)
	}
	if collection.Latest.Profile.Username != "testuser" {
		t.Errorf("username = %q", collection.Latest.Profile.Username)
	}
	if n := atomic.LoadInt32(&attempts); n != 3 {
		t.Errorf("attempts = %d, want 3", n)
	}
}

func TestFetchStatsCollection_429_Retries(t *testing.T) {
	var attempts int32

	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&attempts, 1)
		if n < 2 {
			http.Error(w, "rate limited", http.StatusTooManyRequests)
			return
		}
		http.Redirect(w, r, fmt.Sprintf("/siege/testuser/%s", validUUID), http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/testuser/%s", validUUID), func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, `<html><body><script id="__NUXT_DATA__">[]</script></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	retry := RetryPolicy{MaxAttempts: 3, InitialBackoffMS: 1, MaxBackoffMS: 10}
	client := NewStatsClient(srv.URL, nuxtScrape).WithRetry(retry)
	collection, err := client.FetchStatsCollection(context.Background(), "testuser", StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchStatsCollection() error: %v", err)
	}
	if collection.Latest.Profile.Username != "testuser" {
		t.Errorf("username = %q", collection.Latest.Profile.Username)
	}
	if n := atomic.LoadInt32(&attempts); n != 2 {
		t.Errorf("attempts = %d, want 2", n)
	}
}

func TestFetchStatsCollection_NonRetryable404(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, _ *http.Request) {
		http.NotFound(w, nil)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewStatsClient(srv.URL, noopScrape).WithRetry(NoRetryPolicy())
	_, err := client.FetchStatsCollection(context.Background(), "testuser", StatsPlatformPC)
	if err == nil {
		t.Fatal("expected error")
	}
	fetchErr, ok := err.(*StatsFetchError)
	if !ok {
		t.Fatalf("error type = %T, want *StatsFetchError", err)
	}
	if fetchErr.Kind != StatsFetchErrorProfileNotFound {
		t.Errorf("error kind = %v, want ProfileNotFound", fetchErr.Kind)
	}
}

func TestFetchStats_Latest(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, fmt.Sprintf("/siege/testuser/%s", validUUID), http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/testuser/%s", validUUID), func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, `<html><body><script id="__NUXT_DATA__">[]</script></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewStatsClient(srv.URL, nuxtScrape).WithRetry(NoRetryPolicy())
	stats, err := client.FetchStats(context.Background(), "testuser", StatsPlatformPC, nil)
	if err != nil {
		t.Fatalf("FetchStats() error: %v", err)
	}
	if stats.Profile.Username != "testuser" {
		t.Errorf("username = %q", stats.Profile.Username)
	}
}

func TestFetchStats_BySlug(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, fmt.Sprintf("/siege/testuser/%s", validUUID), http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/testuser/%s", validUUID), func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, `<html><body><script id="__NUXT_DATA__">[]</script></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewStatsClient(srv.URL, nuxtScrape).WithRetry(NoRetryPolicy())
	sel := "y10s1"
	stats, err := client.FetchStats(context.Background(), "testuser", StatsPlatformPC, &sel)
	if err != nil {
		t.Fatalf("FetchStats() error: %v", err)
	}
	if stats.RankedStats.Season != "Y10S1" {
		t.Errorf("season = %q, want Y10S1", stats.RankedStats.Season)
	}
}

func TestFetchStats_SeasonNotFound(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, fmt.Sprintf("/siege/testuser/%s", validUUID), http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/testuser/%s", validUUID), func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, `<html><body><script id="__NUXT_DATA__">[]</script></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewStatsClient(srv.URL, nuxtScrape).WithRetry(NoRetryPolicy())
	sel := "nonexistent"
	_, err := client.FetchStats(context.Background(), "testuser", StatsPlatformPC, &sel)
	if err == nil {
		t.Fatal("expected error")
	}
	fetchErr, ok := err.(*StatsFetchError)
	if !ok {
		t.Fatalf("error type = %T, want *StatsFetchError", err)
	}
	if fetchErr.Kind != StatsFetchErrorSeasonNotFound {
		t.Errorf("error kind = %v, want SeasonNotFound", fetchErr.Kind)
	}
	if fetchErr.RequestedSeason != "nonexistent" {
		t.Errorf("requested_season = %q, want nonexistent", fetchErr.RequestedSeason)
	}
}

func TestFetchStatsCollectionWithHTML(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, fmt.Sprintf("/siege/testuser/%s", validUUID), http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/testuser/%s", validUUID), func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, `<html><body><script id="__NUXT_DATA__">[1,"test"]</script></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewStatsClient(srv.URL, nuxtScrape).WithRetry(NoRetryPolicy())
	collection, html, err := client.FetchStatsCollectionWithHTML(context.Background(), "testuser", StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchStatsCollectionWithHTML() error: %v", err)
	}
	if collection.Latest.Profile.Username != "testuser" {
		t.Errorf("username = %q", collection.Latest.Profile.Username)
	}
	if !strings.Contains(html, "__NUXT_DATA__") {
		t.Error("html should contain __NUXT_DATA__")
	}
}

func TestFetchStatsPage_Success(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, fmt.Sprintf("/siege/testuser/%s", validUUID), http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/testuser/%s", validUUID), func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, `<html><body><script id="__NUXT_DATA__">[1,"data"]</script></body></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewStatsClient(srv.URL, noopScrape).WithRetry(NoRetryPolicy())
	html, err := client.FetchStatsPage(context.Background(), "testuser", StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchStatsPage() error: %v", err)
	}
	if !strings.Contains(html, "__NUXT_DATA__") {
		t.Error("html should contain __NUXT_DATA__")
	}
}

func TestFetchStatsCollection_ContextCancelled(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, fmt.Sprintf("/siege/testuser/%s", validUUID), http.StatusFound)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	client := NewStatsClient(srv.URL, noopScrape).WithRetry(NoRetryPolicy())
	_, err := client.FetchStatsCollection(ctx, "testuser", StatsPlatformPC)
	if err == nil {
		t.Fatal("expected error for cancelled context")
	}
}

func TestWarmup_Success(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewStatsClient(srv.URL, noopScrape)
	client.Warmup(context.Background())
}

func TestWarmup_Error(t *testing.T) {
	client := NewStatsClient("http://127.0.0.1:1", noopScrape)
	client.Warmup(context.Background())
}

func TestStatusUint16(t *testing.T) {
	p := statusUint16(429)
	if p == nil || *p != 429 {
		t.Errorf("statusUint16(429) = %v, want 429", p)
	}
}

func TestAttachResolvedTarget(t *testing.T) {
	collection := &scrape.ScrapedStatsCollection{
		Latest: scrape.ScrapedStats{},
		BySeason: map[string]scrape.ScrapedStats{
			"s1": {},
		},
	}
	target := &resolvedProfileTarget{
		uuid:       "test-uuid",
		platform:   StatsPlatformXbox,
		profileURL: "https://stats.cc/siege/user/test-uuid",
	}
	attachResolvedTarget(collection, target)

	if collection.Latest.Profile.ProfileID != "test-uuid" {
		t.Errorf("latest profile_id = %q", collection.Latest.Profile.ProfileID)
	}
	if collection.Latest.Profile.Platform != "xbox" {
		t.Errorf("latest platform = %q", collection.Latest.Profile.Platform)
	}
	s1 := collection.BySeason["s1"]
	if s1.Profile.ProfileID != "test-uuid" {
		t.Errorf("s1 profile_id = %q", s1.Profile.ProfileID)
	}
}
