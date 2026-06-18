package api_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/pactum-computers/parley/internal/stats/api"
)

func TestClient_HeadersAndEndpoints(t *testing.T) {
	var gotKey, gotUA string
	var configHits, searchHits, profileHits, matchHits int

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/config", func(w http.ResponseWriter, r *http.Request) {
		configHits++
		gotKey = r.Header.Get("X-Api-Key")
		gotUA = r.Header.Get("User-Agent")
		http.ServeFile(w, r, "testdata/config.json")
	})
	mux.HandleFunc("/v2/profiles/search", func(w http.ResponseWriter, r *http.Request) {
		searchHits++
		http.ServeFile(w, r, "testdata/search.json")
	})
	mux.HandleFunc("/v2/profiles/b833121d-9b81-457d-91ef-41ff9d1a9e30", func(w http.ResponseWriter, r *http.Request) {
		profileHits++
		http.ServeFile(w, r, "testdata/profile.json")
	})
	mux.HandleFunc("/v2/profiles/b833121d-9b81-457d-91ef-41ff9d1a9e30/matches", func(w http.ResponseWriter, r *http.Request) {
		matchHits++
		http.ServeFile(w, r, "testdata/matches.json")
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := api.NewClient(api.Options{BaseURL: srv.URL, APIKey: "test-key"})
	ctx := context.Background()

	if _, err := client.GetConfig(ctx); err != nil {
		t.Fatalf("GetConfig: %v", err)
	}
	hits, err := client.Search(ctx, "Avqny", "pc", 5)
	if err != nil || len(hits) == 0 {
		t.Fatalf("Search: %v len=%d", err, len(hits))
	}
	if _, err := client.GetProfile(ctx, hits[0].Profile.ID); err != nil {
		t.Fatalf("GetProfile: %v", err)
	}
	if _, err := client.ListMatches(ctx, hits[0].Profile.ID, "ranked"); err != nil {
		t.Fatalf("ListMatches: %v", err)
	}

	if gotKey != "test-key" {
		t.Fatalf("api key = %q", gotKey)
	}
	if gotUA != "parley.bot" {
		t.Fatalf("user-agent = %q", gotUA)
	}
	if configHits != 1 || searchHits != 1 || profileHits != 1 || matchHits != 1 {
		t.Fatalf("hits config=%d search=%d profile=%d matches=%d", configHits, searchHits, profileHits, matchHits)
	}
}

func TestConfigCache_AvoidsRepeatFetch(t *testing.T) {
	var hits int
	mux := http.NewServeMux()
	mux.HandleFunc("/v2/config", func(w http.ResponseWriter, r *http.Request) {
		hits++
		http.ServeFile(w, r, "testdata/config.json")
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	cache := api.NewConfigCache(nil, 0)
	client := api.NewClient(api.Options{BaseURL: srv.URL, APIKey: "k", ConfigCache: cache})
	ctx := context.Background()

	if _, err := client.GetConfig(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetConfig(ctx); err != nil {
		t.Fatal(err)
	}
	if hits != 1 {
		t.Fatalf("config fetches = %d, want 1", hits)
	}
}

func TestFixturesExist(t *testing.T) {
	for _, f := range []string{"config.json", "search.json", "profile.json", "matches.json"} {
		if _, err := os.Stat("testdata/" + f); err != nil {
			t.Fatalf("missing fixture %s: %v", f, err)
		}
	}
}
