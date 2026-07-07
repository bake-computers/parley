package api_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"testing"
	"time"

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

	client := api.NewClient(api.Options{BaseURL: srv.URL, APIKey: "test-key", DisableProfileBatch: true})
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

func TestClient_BatchProfiles_PostsExpectedPayload(t *testing.T) {
	var gotKey, gotUA, gotContentType string
	var gotIDs []string

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		gotKey = r.Header.Get("X-Api-Key")
		gotUA = r.Header.Get("User-Agent")
		gotContentType = r.Header.Get("Content-Type")
		var body struct {
			ProfileIDs []string `json:"profile_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode body: %v", err)
		}
		gotIDs = body.ProfileIDs
		_, _ = io.WriteString(w, `[
			{"id":"id-1","username":"One","platform":"pc","level":1},
			{"id":"id-2","username":"Two","platform":"xbox","level":2}
		]`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := api.NewClient(api.Options{BaseURL: srv.URL, APIKey: "test-key"})
	profiles, err := client.BatchProfiles(context.Background(), []string{"id-1", "id-2"})
	if err != nil {
		t.Fatalf("BatchProfiles: %v", err)
	}
	if gotKey != "test-key" {
		t.Fatalf("api key = %q", gotKey)
	}
	if gotUA != "parley.bot" {
		t.Fatalf("user-agent = %q", gotUA)
	}
	if gotContentType != "application/json" {
		t.Fatalf("content-type = %q", gotContentType)
	}
	if len(gotIDs) != 2 || gotIDs[0] != "id-1" || gotIDs[1] != "id-2" {
		t.Fatalf("profile_ids = %#v", gotIDs)
	}
	if len(profiles) != 2 || profiles[0].ID != "id-1" || profiles[1].ID != "id-2" {
		t.Fatalf("profiles = %#v", profiles)
	}
}

func TestClient_GetProfile_UsesBatcherSizeFlush(t *testing.T) {
	var batchHits int32
	var directHits int32
	var gotIDs []string
	var mu sync.Mutex

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&batchHits, 1)
		ids := decodeBatchIDs(t, r)
		mu.Lock()
		gotIDs = append(gotIDs, ids...)
		mu.Unlock()
		writeProfiles(w, ids)
	})
	mux.HandleFunc("/v2/profiles/", func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&directHits, 1)
		http.Error(w, "direct endpoint should not be used", http.StatusTeapot)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := api.NewClient(api.Options{
		BaseURL:           srv.URL,
		ProfileBatchSize:  2,
		ProfileBatchDelay: time.Hour,
	})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	var wg sync.WaitGroup
	errs := make([]error, 2)
	ids := []string{"id-1", "id-2"}
	for i := range ids {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = client.GetProfile(ctx, ids[i])
		}(i)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatalf("GetProfile: %v", err)
		}
	}

	if atomic.LoadInt32(&batchHits) != 1 {
		t.Fatalf("batch hits = %d, want 1", batchHits)
	}
	if atomic.LoadInt32(&directHits) != 0 {
		t.Fatalf("direct hits = %d, want 0", directHits)
	}
	sort.Strings(gotIDs)
	if len(gotIDs) != 2 || gotIDs[0] != "id-1" || gotIDs[1] != "id-2" {
		t.Fatalf("batched ids = %#v", gotIDs)
	}
}

func TestClient_GetProfile_UsesBatcherDelayFlush(t *testing.T) {
	var batchHits int32
	var gotIDs []string
	var mu sync.Mutex

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&batchHits, 1)
		ids := decodeBatchIDs(t, r)
		mu.Lock()
		gotIDs = append(gotIDs, ids...)
		mu.Unlock()
		writeProfiles(w, ids)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := api.NewClient(api.Options{
		BaseURL:           srv.URL,
		ProfileBatchSize:  10,
		ProfileBatchDelay: 20 * time.Millisecond,
	})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	profile, err := client.GetProfile(ctx, "id-1")
	if err != nil {
		t.Fatalf("GetProfile: %v", err)
	}
	if profile.ID != "id-1" {
		t.Fatalf("profile id = %q", profile.ID)
	}
	if atomic.LoadInt32(&batchHits) != 1 {
		t.Fatalf("batch hits = %d, want 1", batchHits)
	}
	if len(gotIDs) != 1 || gotIDs[0] != "id-1" {
		t.Fatalf("batched ids = %#v", gotIDs)
	}
}

func TestClient_GetProfile_DedupesSameID(t *testing.T) {
	var batchHits int32
	var gotIDs []string
	var mu sync.Mutex

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&batchHits, 1)
		ids := decodeBatchIDs(t, r)
		mu.Lock()
		gotIDs = append(gotIDs, ids...)
		mu.Unlock()
		writeProfiles(w, ids)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := api.NewClient(api.Options{
		BaseURL:           srv.URL,
		ProfileBatchSize:  10,
		ProfileBatchDelay: 20 * time.Millisecond,
	})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	var wg sync.WaitGroup
	profiles := make([]*api.Profile, 2)
	errs := make([]error, 2)
	for i := range profiles {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			profiles[i], errs[i] = client.GetProfile(ctx, "id-1")
		}(i)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatalf("GetProfile: %v", err)
		}
	}
	if profiles[0].ID != "id-1" || profiles[1].ID != "id-1" {
		t.Fatalf("profiles = %#v", profiles)
	}
	if atomic.LoadInt32(&batchHits) != 1 {
		t.Fatalf("batch hits = %d, want 1", batchHits)
	}
	if len(gotIDs) != 1 || gotIDs[0] != "id-1" {
		t.Fatalf("batched ids = %#v", gotIDs)
	}
}

func TestClient_GetProfile_BatchMissingIDReturnsProfileNotFound(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `[]`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := api.NewClient(api.Options{
		BaseURL:           srv.URL,
		ProfileBatchDelay: 1 * time.Millisecond,
	})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, err := client.GetProfile(ctx, "missing")
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*api.Error)
	if !ok || apiErr.Kind != api.ErrProfileNotFound {
		t.Fatalf("got %T %v, want ErrProfileNotFound", err, err)
	}
}

func TestClient_GetProfile_DisableBatchUsesDirectEndpoint(t *testing.T) {
	var batchHits int32
	var directHits int32

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/profiles/batch", func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&batchHits, 1)
		http.Error(w, "batch endpoint should not be used", http.StatusTeapot)
	})
	mux.HandleFunc("/v2/profiles/id-1", func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&directHits, 1)
		_, _ = io.WriteString(w, `{"id":"id-1","username":"One","platform":"pc","level":1}`)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := api.NewClient(api.Options{BaseURL: srv.URL, DisableProfileBatch: true})
	profile, err := client.GetProfile(context.Background(), "id-1")
	if err != nil {
		t.Fatalf("GetProfile: %v", err)
	}
	if profile.ID != "id-1" {
		t.Fatalf("profile id = %q", profile.ID)
	}
	if atomic.LoadInt32(&batchHits) != 0 {
		t.Fatalf("batch hits = %d, want 0", batchHits)
	}
	if atomic.LoadInt32(&directHits) != 1 {
		t.Fatalf("direct hits = %d, want 1", directHits)
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

func decodeBatchIDs(t *testing.T, r *http.Request) []string {
	t.Helper()
	if r.Method != http.MethodPost {
		t.Fatalf("method = %s, want POST", r.Method)
	}
	var body struct {
		ProfileIDs []string `json:"profile_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	return body.ProfileIDs
}

func writeProfiles(w http.ResponseWriter, ids []string) {
	profiles := make([]api.Profile, 0, len(ids))
	for _, id := range ids {
		profiles = append(profiles, api.Profile{
			ID:       id,
			Username: "user-" + id,
			Platform: "pc",
			Level:    1,
		})
	}
	_ = json.NewEncoder(w).Encode(profiles)
}

func TestFixturesExist(t *testing.T) {
	for _, f := range []string{"config.json", "search.json", "profile.json", "matches.json"} {
		if _, err := os.Stat("testdata/" + f); err != nil {
			t.Fatalf("missing fixture %s: %v", f, err)
		}
	}
}
