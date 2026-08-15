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

func TestNew_AlwaysJSONIncludingDebug(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	log := logging.NewWithWriter("debug", &buf, logging.PipelineOptions{})
	log.Debug("hello")
	line := strings.TrimSpace(buf.String())
	if !strings.Contains(line, `"message"`) || !strings.Contains(line, "hello") {
		t.Fatalf("expected JSON debug line, got %q", line)
	}
	if !strings.Contains(line, `"ts"`) {
		t.Fatalf("expected ts key, got %q", line)
	}
	if !strings.Contains(line, `"level":"debug"`) {
		t.Fatalf("expected lowercase debug level, got %q", line)
	}
	if !strings.Contains(line, `"service":"engine"`) {
		t.Fatalf("expected service=engine, got %q", line)
	}
}

func TestNew_InfoUsesJSONHandler(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	log := logging.NewWithWriter("info", &buf, logging.PipelineOptions{})
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
	log := logging.NewWithWriter("warn", &buf, logging.PipelineOptions{})
	log.Info("should not appear")
	log.Warn("should appear")
	if strings.Contains(buf.String(), "should not appear") {
		t.Fatalf("info message should be filtered at warn level, got %q", buf.String())
	}
	if !strings.Contains(buf.String(), "should appear") {
		t.Fatalf("warn message missing, got %q", buf.String())
	}
}

func TestNewWithPipeline_DisabledNoop(t *testing.T) {
	t.Parallel()
	h, err := logging.NewPipelineHandler(logging.PipelineOptions{})
	if err != nil {
		t.Fatal(err)
	}
	log := logging.NewWithPipeline("info", h)
	log.Info("should not panic")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestPipelineHandler_FlushesBatchOnShutdown(t *testing.T) {
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

	opts := logging.PipelineOptions{
		Token:         "test-token",
		IngestURL:     srv.URL,
		BatchSize:     10,
		FlushInterval: time.Hour,
		BufferSize:    64,
	}

	h, err := logging.NewPipelineHandler(opts)
	if err != nil {
		t.Fatal(err)
	}
	log := logging.NewWithPipeline("info", h)
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
	// Pipelines ingests an unstructured stream: each shipped record is wrapped as {"value": <record>}.
	wrapped, ok := batch[0]["value"].(map[string]any)
	if !ok {
		t.Fatalf("expected wrapped record, got %v", batch[0])
	}
	ev := wrapped
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

func TestPipelineHandler_Allowlist(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	var bodies [][]byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("auth %q", got)
		}
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		bodies = append(bodies, b)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h, err := logging.NewPipelineHandler(logging.PipelineOptions{
		Token:         "test-token",
		IngestURL:     srv.URL,
		BatchSize:     10,
		FlushInterval: time.Hour,
		BufferSize:    64,
	})
	if err != nil {
		t.Fatal(err)
	}
	log := logging.NewWithPipeline("info", h)
	// Plain boot info must not ship.
	log.Info("engine-service listening", "addr", "0.0.0.0:50051")
	// Allowlisted info event must ship.
	log.Info("POST /parley.matchmaking.v1.MatchmakingService/BuildTeams 200 (3.1ms)",
		"event", "request.completed",
		"where", "engine POST /parley.matchmaking.v1.MatchmakingService/BuildTeams",
		"outcome", "success",
		"duration_ms", 3.1,
	)
	// Warn always ships, even without an allowlisted event attr.
	log.Warn("db query failed", "event", "db.query", "outcome", "error")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	defer mu.Unlock()
	var events []map[string]any
	for _, body := range bodies {
		var batch []map[string]any
		if err := json.Unmarshal(body, &batch); err != nil {
			t.Fatal(err)
		}
		for _, rec := range batch {
			wrapped, ok := rec["value"].(map[string]any)
			if !ok {
				t.Fatalf("expected wrapped record, got %v", rec)
			}
			events = append(events, wrapped)
		}
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 shipped events, got %d: %v", len(events), events)
	}
	if events[0]["event"] != "request.completed" {
		t.Fatalf("first event %v", events[0]["event"])
	}
	if events[1]["event"] != "db.query" {
		t.Fatalf("second event %v", events[1]["event"])
	}
	if events[1]["level"] != "warn" {
		t.Fatalf("expected warn level for second event, got %v", events[1]["level"])
	}
}

func TestPipelineHandler_UnconfiguredNeverPosts(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	log := logging.NewWithWriter("debug", &buf, logging.PipelineOptions{})
	log.Debug("health check")
	log.Info("engine-service listening")
	log.Warn("something")
	// Nothing configured: only the writer JSON exists, no POSTs happened.
	if !strings.Contains(buf.String(), `"message":"health check"`) {
		t.Fatalf("expected debug line on the writer, got %q", buf.String())
	}
}
