package logging_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bake-computers/parley/internal/logging"
)

func TestResolveIngestURL_DefaultUS(t *testing.T) {
	t.Parallel()
	got := logging.ResolveIngestURL("parley", "", "")
	want := "https://api.axiom.co/v1/datasets/parley/ingest"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResolveIngestURL_EdgeDomain(t *testing.T) {
	t.Parallel()
	got := logging.ResolveIngestURL("parley", "eu-central-1.aws.edge.axiom.co", "")
	want := "https://eu-central-1.aws.edge.axiom.co/v1/ingest/parley"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResolveIngestURL_EdgeURL(t *testing.T) {
	t.Parallel()
	got := logging.ResolveIngestURL("ds", "", "https://custom.edge.example")
	want := "https://custom.edge.example/v1/ingest/ds"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestNew_DebugUsesTextHandler(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	log := logging.NewWithWriter("debug", &buf, logging.AxiomOptions{Enabled: false})
	log.Debug("hello")
	if !strings.Contains(buf.String(), "hello") {
		t.Fatalf("expected debug output containing 'hello', got %q", buf.String())
	}
	if !strings.Contains(buf.String(), "DEBUG") {
		t.Fatalf("expected text debug output with DEBUG level, got %q", buf.String())
	}
}

func TestNew_InfoUsesJSONHandler(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	log := logging.NewWithWriter("info", &buf, logging.AxiomOptions{Enabled: false})
	log.Info("hello")
	line := strings.TrimSpace(buf.String())
	if !strings.Contains(line, `"msg"`) || !strings.Contains(line, "hello") {
		t.Fatalf("expected JSON log line, got %q", line)
	}
}

func TestNew_SetsLevel(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	log := logging.NewWithWriter("warn", &buf, logging.AxiomOptions{Enabled: false})
	log.Info("should not appear")
	log.Warn("should appear")
	if strings.Contains(buf.String(), "should not appear") {
		t.Fatalf("info message should be filtered at warn level, got %q", buf.String())
	}
	if !strings.Contains(buf.String(), "should appear") {
		t.Fatalf("warn message missing, got %q", buf.String())
	}
}

func TestNewWithAxiom_DisabledNoop(t *testing.T) {
	t.Parallel()
	h, err := logging.NewAxiomHandler(logging.AxiomOptions{Enabled: false})
	if err != nil {
		t.Fatal(err)
	}
	log := logging.NewWithAxiom("info", h)
	log.Info("should not panic")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestAxiomHandler_FlushesBatchOnShutdown(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	var bodies [][]byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method %s", r.Method)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("auth %q", got)
		}
		b, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
		}
		mu.Lock()
		bodies = append(bodies, b)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	opts := logging.AxiomOptions{
		Token:         "test-token",
		Dataset:       "parley",
		Enabled:       true,
		BatchSize:     10,
		FlushInterval: time.Hour,
		BufferSize:    64,
		IngestURL:     srv.URL,
	}

	h, err := logging.NewAxiomHandler(opts)
	if err != nil {
		t.Fatal(err)
	}
	logging.LogHTTP(h, "GET", "/health", 200, 1.5, nil, nil, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(bodies) == 0 {
		t.Fatal("expected at least one POST")
	}
	var batch []map[string]any
	if err := json.Unmarshal(bodies[len(bodies)-1], &batch); err != nil {
		t.Fatal(err)
	}
	if len(batch) < 1 {
		t.Fatalf("batch len %d", len(batch))
	}
	if batch[0]["event"] != "http" {
		t.Fatalf("event %v", batch[0]["event"])
	}
}

func TestAxiomHandler_NoOpWhenDisabled(t *testing.T) {
	t.Parallel()
	h, err := logging.NewAxiomHandler(logging.AxiomOptions{Enabled: false})
	if err != nil {
		t.Fatal(err)
	}
	if h.EnabledForHelpers() {
		t.Fatal("disabled handler should not be enabled for helpers")
	}
	// Should not panic
	logging.LogHTTP(h, "GET", "/", 200, 0, nil, nil, nil)
	logging.LogDB(h, "SELECT", "t", 0, nil)
	logging.LogCache(h, "hit", "r6", nil)
	logging.LogError(h, "svc", "code", "msg", nil)
}

func TestHelpers_EnqueueAllEventTypes(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	var bodies [][]byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		bodies = append(bodies, b)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h, err := logging.NewAxiomHandler(logging.AxiomOptions{
		Token:     "tok",
		Enabled:   true,
		BatchSize: 1, // flush after each enqueue
		IngestURL: srv.URL,
	})
	if err != nil {
		t.Fatal(err)
	}

	strp := func(s string) *string { return &s }
	logging.LogHTTP(h, "POST", "/api/test", 201, 42.0, strp("agent"), strp("app/json"), strp("origin"))
	logging.LogDB(h, "SELECT", "users", 5.0, nil)
	logging.LogCache(h, "hit", "r6", strp("hash123"))
	logging.LogError(h, "api", "ERR_TEST", "something broke", strp("/path"))

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(bodies) < 4 {
		t.Fatalf("expected at least 4 POSTs, got %d", len(bodies))
	}

	events := make(map[string]bool)
	for _, body := range bodies {
		var batch []map[string]any
		if err := json.Unmarshal(body, &batch); err != nil {
			t.Fatal(err)
		}
		for _, ev := range batch {
			if e, ok := ev["event"].(string); ok {
				events[e] = true
			}
		}
	}
	for _, want := range []string{"http", "db", "cache", "error"} {
		if !events[want] {
			t.Errorf("missing event type %q", want)
		}
	}
}
