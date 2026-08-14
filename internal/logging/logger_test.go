package logging_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
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

func TestNew_AlwaysJSONIncludingDebug(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	log := logging.NewWithWriter("debug", &buf, logging.AxiomOptions{Enabled: false})
	log.Debug("hello")
	line := strings.TrimSpace(buf.String())
	if !strings.Contains(line, `"message"`) || !strings.Contains(line, "hello") {
		t.Fatalf("expected JSON debug line, got %q", line)
	}
	if !strings.Contains(line, `"ts"`) {
		t.Fatalf("expected ts key for Axiom, got %q", line)
	}
	if !strings.Contains(line, `"level":"debug"`) {
		t.Fatalf("expected lowercase debug level for Axiom, got %q", line)
	}
	if !strings.Contains(line, `"service":"engine"`) {
		t.Fatalf("expected service=engine, got %q", line)
	}
}

func TestNew_InfoUsesJSONHandler(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	log := logging.NewWithWriter("info", &buf, logging.AxiomOptions{Enabled: false})
	log.Info("hello")
	line := strings.TrimSpace(buf.String())
	if !strings.Contains(line, `"message"`) || !strings.Contains(line, "hello") {
		t.Fatalf("expected JSON log line, got %q", line)
	}
	if !strings.Contains(line, `"level":"info"`) {
		t.Fatalf("expected lowercase info level, got %q", line)
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
	log := logging.NewWithAxiom("info", h)
	log.Info("POST /parley.matchmaking.v1.MatchmakingService/CreateMatch 200 (12.4ms)",
		"event", "request.completed",
		"where", "engine POST /parley.matchmaking.v1.MatchmakingService/CreateMatch",
		"request_id", "req-1",
		"outcome", "success",
		"duration_ms", 12.4,
		"http", slog.GroupValue(
			slog.String("method", "POST"),
			slog.String("path", "/parley.matchmaking.v1.MatchmakingService/CreateMatch"),
			slog.Int("status", 200),
		),
	)

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
	ev := batch[0]
	if ev["event"] != "request.completed" {
		t.Fatalf("event %v", ev["event"])
	}
	if ev["level"] != "info" {
		t.Fatalf("expected level info, got %v", ev["level"])
	}
	if ev["message"] != "POST /parley.matchmaking.v1.MatchmakingService/CreateMatch 200 (12.4ms)" {
		t.Fatalf("message %v", ev["message"])
	}
	if ev["where"] != "engine POST /parley.matchmaking.v1.MatchmakingService/CreateMatch" {
		t.Fatalf("where %v", ev["where"])
	}
	if ev["request_id"] != "req-1" {
		t.Fatalf("request_id %v", ev["request_id"])
	}
	if ev["outcome"] != "success" {
		t.Fatalf("outcome %v", ev["outcome"])
	}
	if ev["ts"] == "" || ev["ts"] == nil {
		t.Fatalf("missing ts key, got %v", ev)
	}
	httpGroup, ok := ev["http"].(map[string]any)
	if !ok {
		t.Fatalf("expected http group, got %v", ev["http"])
	}
	if httpGroup["method"] != "POST" || httpGroup["path"] != "/parley.matchmaking.v1.MatchmakingService/CreateMatch" || httpGroup["status"] != float64(200) {
		t.Fatalf("http group %v", httpGroup)
	}
}

func TestAxiomHandler_SlogLevelsLowercase(t *testing.T) {
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
		Level:     "debug",
		BatchSize: 1,
		IngestURL: srv.URL,
	})
	if err != nil {
		t.Fatal(err)
	}
	log := logging.NewWithAxiom("debug", h)
	log.Debug("dbg")
	log.Error("err")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(bodies) < 2 {
		t.Fatalf("expected >=2 posts, got %d", len(bodies))
	}
	levels := map[string]bool{}
	for _, body := range bodies {
		var batch []map[string]any
		if err := json.Unmarshal(body, &batch); err != nil {
			t.Fatal(err)
		}
		for _, ev := range batch {
			if lv, ok := ev["level"].(string); ok {
				levels[lv] = true
			}
		}
	}
	if !levels["debug"] || !levels["error"] {
		t.Fatalf("want debug+error levels, got %v", levels)
	}
}
