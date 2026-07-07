package fetch

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pactum-computers/parley/internal/stats/api"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

func TestFetchStatsCollection_APIFallbackToScraper(t *testing.T) {
	var scraperHits int32

	profileID := "b833121d-9b81-457d-91ef-41ff9d1a9e30"
	mux := http.NewServeMux()
	mux.HandleFunc("/v2/config", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/config.json")
	})
	mux.HandleFunc("/v2/profiles/search", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/search.json")
	})
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "upstream down", http.StatusInternalServerError)
	})
	mux.HandleFunc("/v2/profiles/"+profileID, func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "direct profile endpoint should not be used", http.StatusTeapot)
	})
	mux.HandleFunc("/siege", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&scraperHits, 1)
		http.Redirect(w, r, fmt.Sprintf("/siege/Avqny/%s", validUUID), http.StatusFound)
	})
	mux.HandleFunc(fmt.Sprintf("/siege/Avqny/%s", validUUID), func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, `<html><script id="__NUXT_DATA__">[]</script></html>`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	cache := api.NewConfigCache(nil, 0)
	client := NewStatsClientFromOptions(ClientOptions{
		APIKey:         "test-key",
		APIBaseURL:     srv.URL,
		ScraperBaseURL: srv.URL,
		ScrapeFn:       nuxtScrape,
		ConfigCache:    cache,
	}).WithRetry(NoRetryPolicy())

	collection, err := client.FetchStatsCollection(context.Background(), "Avqny", StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchStatsCollection: %v", err)
	}
	if collection.Latest.Profile.Username != "Avqny" {
		t.Fatalf("username = %q", collection.Latest.Profile.Username)
	}
	if atomic.LoadInt32(&scraperHits) == 0 {
		t.Fatal("expected scraper fallback")
	}
}

func TestFetchStatsCollection_APIProfileNotFound_NoFallback(t *testing.T) {
	var scraperHits int32

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/config", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/config.json")
	})
	mux.HandleFunc("/v2/profiles/search", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("[]"))
	})
	mux.HandleFunc("/siege", func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&scraperHits, 1)
		http.Error(w, "should not hit scraper", http.StatusTeapot)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	cache := api.NewConfigCache(nil, 0)
	client := NewStatsClientFromOptions(ClientOptions{
		APIKey:         "test-key",
		APIBaseURL:     srv.URL,
		ScraperBaseURL: srv.URL,
		ScrapeFn: func(_ string) scrape.ScrapedStatsCollection {
			t.Fatal("scraper should not run")
			return scrape.ScrapedStatsCollection{}
		},
		ConfigCache: cache,
	}).WithRetry(NoRetryPolicy())

	_, err := client.FetchStatsCollection(context.Background(), "nobody-here", StatsPlatformPC)
	if err == nil {
		t.Fatal("expected error")
	}
	fe, ok := err.(*StatsFetchError)
	if !ok || fe.Kind != StatsFetchErrorProfileNotFound {
		t.Fatalf("got %T %v", err, err)
	}
	if atomic.LoadInt32(&scraperHits) != 0 {
		t.Fatal("scraper should not run on profile not found")
	}
}

func TestFetchStatsCollection_APISuccess(t *testing.T) {
	var scraperHits int32
	var batchHits int32
	var directHits int32
	profileID := "b833121d-9b81-457d-91ef-41ff9d1a9e30"

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/config", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/config.json")
	})
	mux.HandleFunc("/v2/profiles/search", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/search.json")
	})
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&batchHits, 1)
		writeProfileFixtureBatch(t, w)
	})
	mux.HandleFunc("/v2/profiles/"+profileID, func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&directHits, 1)
		http.Error(w, "direct profile endpoint should not be used", http.StatusTeapot)
	})
	mux.HandleFunc("/v2/profiles/"+profileID+"/matches", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/matches.json")
	})
	mux.HandleFunc("/siege", func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&scraperHits, 1)
		http.Error(w, "should not hit scraper", http.StatusTeapot)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	cache := api.NewConfigCache(nil, 0)
	client := NewStatsClientFromOptions(ClientOptions{
		APIKey:         "test-key",
		APIBaseURL:     srv.URL,
		ScraperBaseURL: srv.URL,
		ScrapeFn:       nuxtScrape,
		ConfigCache:    cache,
	}).WithRetry(NoRetryPolicy())

	collection, err := client.FetchStatsCollection(context.Background(), "Avqny", StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchStatsCollection: %v", err)
	}
	if collection.Latest.Profile.ProfileID != profileID {
		t.Fatalf("profile_id = %q", collection.Latest.Profile.ProfileID)
	}
	if collection.Latest.RankedStats.RankPoints <= 0 {
		t.Fatalf("rank_points = %d", collection.Latest.RankedStats.RankPoints)
	}
	if atomic.LoadInt32(&scraperHits) != 0 {
		t.Fatal("scraper should not run on api success")
	}
	if atomic.LoadInt32(&batchHits) != 1 {
		t.Fatalf("batch hits = %d, want 1", batchHits)
	}
	if atomic.LoadInt32(&directHits) != 0 {
		t.Fatalf("direct hits = %d, want 0", directHits)
	}
}

func TestFetchStatsCollection_APIUsesProfileBatch(t *testing.T) {
	var batchHits int32
	var directHits int32
	profileID := "b833121d-9b81-457d-91ef-41ff9d1a9e30"

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/config", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/config.json")
	})
	mux.HandleFunc("/v2/profiles/search", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/search.json")
	})
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&batchHits, 1)
		writeProfileFixtureBatch(t, w)
	})
	mux.HandleFunc("/v2/profiles/"+profileID, func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&directHits, 1)
		http.Error(w, "direct profile endpoint should not be used", http.StatusTeapot)
	})
	mux.HandleFunc("/v2/profiles/"+profileID+"/matches", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/matches.json")
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	cache := api.NewConfigCache(nil, 0)
	client := NewStatsClientFromOptions(ClientOptions{
		APIKey:            "test-key",
		APIBaseURL:        srv.URL,
		ScraperBaseURL:    srv.URL,
		ScrapeFn:          nuxtScrape,
		ConfigCache:       cache,
		ProfileBatchDelay: time.Millisecond,
	}).WithRetry(NoRetryPolicy())

	collection, err := client.FetchStatsCollection(context.Background(), "Avqny", StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchStatsCollection: %v", err)
	}
	if collection.Latest.Profile.ProfileID != profileID {
		t.Fatalf("profile_id = %q", collection.Latest.Profile.ProfileID)
	}
	if atomic.LoadInt32(&batchHits) != 1 {
		t.Fatalf("batch hits = %d, want 1", batchHits)
	}
	if atomic.LoadInt32(&directHits) != 0 {
		t.Fatalf("direct hits = %d, want 0", directHits)
	}
}

func TestResolveAPIProfileAuto_SearchesSequentially(t *testing.T) {
	var searchHits int32
	profileID := "b833121d-9b81-457d-91ef-41ff9d1a9e30"

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/profiles/search", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&searchHits, 1)
		if got := r.URL.Query().Get("platform"); got != "pc" {
			t.Fatalf("platform = %q, want pc", got)
		}
		http.ServeFile(w, r, "../api/testdata/search.json")
	})
	mux.HandleFunc("/v2/config", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/config.json")
	})
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, _ *http.Request) {
		writeProfileFixtureBatch(t, w)
	})
	mux.HandleFunc("/v2/profiles/"+profileID+"/matches", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../api/testdata/matches.json")
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	cache := api.NewConfigCache(nil, 0)
	client := NewStatsClientFromOptions(ClientOptions{
		APIKey:            "test-key",
		APIBaseURL:        srv.URL,
		ScraperBaseURL:    srv.URL,
		ScrapeFn:          nuxtScrape,
		ConfigCache:       cache,
		ProfileBatchDelay: time.Millisecond,
	}).WithRetry(NoRetryPolicy())

	if _, err := client.FetchStatsCollection(context.Background(), "Avqny", StatsPlatformAuto); err != nil {
		t.Fatalf("FetchStatsCollection: %v", err)
	}
	if atomic.LoadInt32(&searchHits) != 1 {
		t.Fatalf("search hits = %d, want 1", searchHits)
	}
}

func writeProfileFixtureBatch(t *testing.T, w http.ResponseWriter) {
	t.Helper()
	raw, err := os.ReadFile("../api/testdata/profile.json")
	if err != nil {
		t.Fatalf("read profile fixture: %v", err)
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte("["))
	_, _ = w.Write(raw)
	_, _ = w.Write([]byte("]"))
}
