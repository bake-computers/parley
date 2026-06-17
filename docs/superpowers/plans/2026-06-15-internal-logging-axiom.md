# internal/logging — slog + Axiom batched HTTP shipper

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Task directive:** Do **not** commit unless the user explicitly asks. Skip all “Commit” steps.

**Goal:** Add `internal/logging` with a level-aware `slog` root logger, a non-blocking batched Axiom HTTP ingest path (no official Axiom SDK), typed domain helpers matching `src/logging.rs`, and `httptest` coverage for batch POST behavior.

**Architecture:** Split stdout logging (`New`) from Axiom shipping (`AxiomHandler` + background worker). Hot path only enqueues `[]byte` or `map[string]any` on a buffered channel; a goroutine batches by size and time, POSTs JSON arrays to the resolved ingest URL. Typed helpers (`LogHTTP`, `LogDB`, `LogCache`, `LogError`) enqueue the same tagged JSON shapes as Rust `AxiomEvent`. Ingest URL resolution mirrors `packages/axiom/src/config.ts` (`AXIOM_EDGE`, optional full edge URL env at call site). Wire Axiom credentials via constructor options populated from `internal/config.Config` at the binary layer—do not import `internal/config` inside `internal/logging` unless you only need shared string constants (prefer zero import).

**Tech Stack:** Go 1.25 (`github.com/pactum-computers/parley`), `log/slog`, `net/http`, `encoding/json`, `context`, `sync`, `testing/httptest`.

**Reference implementations:**

| Source | Use for |
|--------|---------|
| `src/logging.rs` | Event tags (`http`, `db`, `cache`, `error`), batch/flush/shutdown, backpressure (drop when full) |
| `packages/axiom/src/config.ts` | `resolveAxiomIngestUrl` edge vs legacy API |
| `packages/axiom/src/logger.ts` | POST headers (`Authorization`, `X-Axiom-Org-Id`) |
| `internal/config/config.go` | Field names: `AxiomToken`, `AxiomDataset`, `AxiomOrgID`, `AxiomEdge`, `AxiomEnabled` |

---

## File map

| Path | Action | Responsibility |
|------|--------|----------------|
| `internal/logging/ingest.go` | create | `ResolveIngestURL(dataset, edge, edgeURL string) string` |
| `internal/logging/events.go` | create | Tagged event structs / `map` builders matching Rust serde `#[serde(tag = "event")]` |
| `internal/logging/axiom.go` | create | `AxiomOptions`, `AxiomHandler`, `slog.Handler`, worker, `Shutdown` |
| `internal/logging/logger.go` | create | `New(level string, axiom *AxiomHandler) *slog.Logger` |
| `internal/logging/helpers.go` | create | `LogHTTP`, `LogDB`, `LogCache`, `LogError` |
| `internal/logging/ingest_test.go` | create | Ingest URL parity with TS tests |
| `internal/logging/logger_test.go` | create | `New` handler format + httptest batch POST |

No new `go.mod` dependencies (stdlib only).

---

## Event JSON contract (must match Rust)

Rust (`src/logging.rs` lines 24–57) uses internally tagged enum `event`:

```json
{"event":"http","method":"GET","path":"/health","status":200,"duration_ms":1.2,...}
{"event":"db","operation":"select","table":"players","duration_ms":3.1,"error":null}
{"event":"cache","action":"hit","game":"r6","username_hash":"abc"}
{"event":"error","service":"identity","code":"NOT_FOUND","message":"...","path":"/x"}
```

Go helpers must emit these keys (snake_case). Omit optional fields when empty; use `null` for explicit absent `error` only if Rust would serialize `None` as omitted—match Rust: `Option` fields omitted when nil.

`slog` records shipped via `AxiomHandler.Handle` should become JSON objects with at least: `time`, `level`, `msg`, plus flattened `Attrs` (use `slog.Record` + `handler.NewJSONHandler` to a `bytes.Buffer` for one record, or manual attr walk). Keep implementation simple: marshal a `map[string]any` per record with `event` default `"log"` or omit tag—**prefer** adding `"event":"log"` for generic slog lines so Axiom queries can filter.

---

## Task 1: Ingest URL resolver

**Files:**

- Create: `internal/logging/ingest.go`
- Test: `internal/logging/ingest_test.go`

- [ ] **Step 1: Write failing tests**

```go
package logging_test

import (
	"testing"

	"github.com/pactum-computers/parley/internal/logging"
)

func TestResolveIngestURL_DefaultUS(t *testing.T) {
	got := logging.ResolveIngestURL("parley", "", "")
	want := "https://api.axiom.co/v1/datasets/parley/ingest"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResolveIngestURL_EdgeDomain(t *testing.T) {
	got := logging.ResolveIngestURL("parley", "eu-central-1.aws.edge.axiom.co", "")
	want := "https://eu-central-1.aws.edge.axiom.co/v1/ingest/parley"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResolveIngestURL_EdgeURLOverride(t *testing.T) {
	got := logging.ResolveIngestURL("parley", "ignored", "https://custom.edge/v1/ingest/")
	want := "https://custom.edge/v1/ingest/parley"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
go test ./internal/logging/... -run ResolveIngestURL -v
```

Expected: build fail or undefined `ResolveIngestURL`.

- [ ] **Step 3: Implement `ResolveIngestURL`**

```go
package logging

import "strings"

func ResolveIngestURL(dataset, edge, edgeURL string) string {
	edgeURL = strings.TrimSpace(edgeURL)
	if edgeURL != "" {
		return strings.TrimRight(edgeURL, "/") + "/v1/ingest/" + dataset
	}
	edge = strings.TrimSpace(edge)
	if edge != "" {
		base := edge
		if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
			base = "https://" + base
		}
		return strings.TrimRight(base, "/") + "/v1/ingest/" + dataset
	}
	return "https://api.axiom.co/v1/datasets/" + dataset + "/ingest"
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
go test ./internal/logging/... -run ResolveIngestURL -v
```

---

## Task 2: Event builders + typed helpers API

**Files:**

- Create: `internal/logging/events.go`
- Create: `internal/logging/helpers.go`

- [ ] **Step 1: Define `AxiomOptions` and event enqueue interface**

In `axiom.go` (stub types first) or `events.go`:

```go
type AxiomOptions struct {
	Token         string
	Dataset       string
	OrgID         string
	Edge          string
	EdgeURL       string // optional full base; if set, overrides Edge for URL resolution
	Enabled       bool
	BatchSize     int           // default 100
	FlushInterval time.Duration // default 1s
	BufferSize    int           // default 2048
	ServiceName   string        // default "engine" for error events if needed
}
```

`func (o AxiomOptions) configured() bool` → `o.Enabled && o.Token != ""`.

- [ ] **Step 2: Event builder functions returning `[]byte` JSON lines for channel**

```go
func encodeHTTPEvent(method, path string, status uint16, durationMS float64, userAgent, contentType, origin *string) []byte
func encodeDBEvent(operation, table string, durationMS float64, errMsg *string) []byte
func encodeCacheEvent(action, game string, usernameHash *string) []byte
func encodeErrorEvent(service, code, message string, path *string) []byte
```

Use `encoding/json.Marshal` on `map[string]any` with `"event"` key set.

- [ ] **Step 3: Helpers (package-level, take `*AxiomHandler`)**

```go
func LogHTTP(h *AxiomHandler, method, path string, status uint16, durationMS float64, userAgent, contentType, origin *string)
func LogDB(h *AxiomHandler, operation, table string, durationMS float64, errMsg *string)
func LogCache(h *AxiomHandler, action, game string, usernameHash *string)
func LogError(h *AxiomHandler, service, code, message string, path *string)
```

Each calls `h.enqueue(payload)` (unexported, non-blocking). If `h == nil` or disabled, no-op (never panic).

---

## Task 3: `AxiomHandler`, worker, `Shutdown` (TDD with httptest)

**Files:**

- Create: `internal/logging/axiom.go`
- Test: `internal/logging/logger_test.go` (partial)

- [ ] **Step 1: Write failing test — batch POST on shutdown**

```go
func TestAxiomHandler_FlushesBatchOnShutdown(t *testing.T) {
	var mu sync.Mutex
	var bodies [][]byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method %s", r.Method)
		}
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

	opts := logging.AxiomOptions{
		Token: "test-token", Dataset: "parley", Enabled: true,
		BatchSize: 10, FlushInterval: time.Hour, BufferSize: 64,
	}
	opts.EdgeURL = srv.URL // test hook: use httptest base as edge URL override

	h, err := logging.NewAxiomHandler(opts)
	if err != nil {
		t.Fatal(err)
	}
	logging.LogHTTP(h, "GET", "/health", 200, 1.5, nil, nil, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(bodies) == 0 {
		t.Fatal("expected at least one POST")
	}
	// body is JSON array
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
```

**Design note for implementer:** Add optional `HTTPClient *http.Client` and `IngestURL string` fields on `AxiomOptions` (unexported or exported) set only in tests so production uses `ResolveIngestURL` + `http.DefaultClient`. Tests set `IngestURL` to `srv.URL + "/v1/ingest/parley"` or pass `EdgeURL: srv.URL` per resolver rules.

- [ ] **Step 2: Run test — expect FAIL**

```bash
go test ./internal/logging/... -run FlushesBatchOnShutdown -v
```

- [ ] **Step 3: Implement `NewAxiomHandler` and worker**

Core requirements:

1. If not `configured()`, return `(*AxiomHandler, nil)` with `enabled=false` and no goroutine (helpers no-op).
2. `ch := make(chan []byte, bufferSize)` — enqueue uses `select { case ch<-b: default: }` (drop under backpressure, no panic).
3. Goroutine loop:
   - `time.Ticker` for flush interval
   - On batch len >= `BatchSize`, flush
   - On shutdown signal, drain channel then flush remainder
4. `flush(batch [][]byte)` → concatenate into single JSON array: unmarshal each payload to `json.RawMessage` and marshal `[]json.RawMessage`, OR store `[]json.RawMessage` in batch from the start.
5. POST via `http.NewRequestWithContext`, headers from TS logger.
6. On HTTP error: log to stderr once (optional `slog.Default`) — **do not panic**; drop batch like Rust `tracing::warn`.

```go
type AxiomHandler struct {
	// mu protects closed
	enqueue func([]byte)
	shutdown func()
	// ... worker fields
}

func NewAxiomHandler(opts AxiomOptions) (*AxiomHandler, error)

func (h *AxiomHandler) Enabled() bool

func (h *AxiomHandler) Shutdown(ctx context.Context) error
```

- [ ] **Step 4: Implement `slog.Handler` on `AxiomHandler`**

```go
func (h *AxiomHandler) Enabled(ctx context.Context, level slog.Level) bool
func (h *AxiomHandler) Handle(ctx context.Context, r slog.Record) error  // enqueue only; return nil
func (h *AxiomHandler) WithAttrs(attrs []slog.Attr) slog.Handler
func (h *AxiomHandler) WithGroup(name string) slog.Handler
```

`Handle` must not block: enqueue serialized record. `WithAttrs` / `WithGroup` return cloned handler with accumulated attrs (standard slog handler pattern).

- [ ] **Step 5: Run test — expect PASS**

```bash
go test ./internal/logging/... -run FlushesBatchOnShutdown -v
```

---

## Task 4: `New(level)` stdout logger

**Files:**

- Create: `internal/logging/logger.go`
- Extend: `internal/logging/logger_test.go`

- [ ] **Step 1: Write failing tests for handler selection**

```go
func TestNew_DebugUsesTextHandler(t *testing.T) {
	// Capture stderr or use io.Discard + custom writer via slog.NewTextHandler
	// Assert: level debug, handler produces text (contains "level=DEBUG" or key=value text format)
}

func TestNew_InfoUsesJSONHandler(t *testing.T) {
	// level "info" -> JSON line with "level":"INFO" or numeric per slog JSONHandler
}
```

Practical approach: pass `io.Writer` hook only in test by using unexported test helper `newWithWriter(level string, w io.Writer, axiom *AxiomHandler) *slog.Logger` OR export `NewWithWriter` for tests only in `_test.go` via export_test.go pattern.

- [ ] **Step 2: Implement `New`**

```go
func New(level string, axiom *AxiomHandler) *slog.Logger {
	lvl := parseLevel(level) // trace/debug -> DebugLevel; info, warn, error; default info
	var stdout slog.Handler
	if strings.EqualFold(level, "debug") || strings.EqualFold(level, "trace") {
		stdout = slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: lvl})
	} else {
		stdout = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: lvl})
	}
	var h slog.Handler = stdout
	if axiom != nil && axiom.Enabled() {
		h = &multiHandler{handlers: []slog.Handler{stdout, axiom}}
	}
	return slog.New(h)
}
```

Implement minimal `multiHandler` in `logger.go` that forwards `Enabled`, `Handle`, `WithAttrs`, `WithGroup` to each child.

`parseLevel`: map `internal/config` default `"info"` and `RUST_LOG` compatibility—accept `debug`, `info`, `warn`, `error` (case-insensitive).

- [ ] **Step 3: Run all package tests**

```bash
go test ./internal/logging/... -v
```

Expected: all PASS.

---

## Task 5: Integration hook (document only — no binary wiring in this task)

When the Go engine entrypoint exists, wire:

```go
cfg, _ := config.Load()
ax, _ := logging.NewAxiomHandler(logging.AxiomOptions{
	Token: cfg.AxiomToken,
	Dataset: cfg.AxiomDataset,
	OrgID: cfg.AxiomOrgID,
	Edge: cfg.AxiomEdge,
	Enabled: cfg.AxiomEnabled && cfg.AxiomToken != "",
})
log := logging.New(cfg.LogLevel, ax)
defer ax.Shutdown(context.Background())
slog.SetDefault(log)
```

Pass `AXIOM_EDGE_URL` from env at call site if added to `config` later; until then `EdgeURL` stays empty.

---

## Verification checklist

| Requirement | Verification |
|-------------|----------------|
| `New(level)` JSON vs text | `TestNew_*` |
| `AxiomHandler` implements `slog.Handler` | compile + optional interface assert `var _ slog.Handler = (*AxiomHandler)(nil)` |
| Batched POST | `TestAxiomHandler_FlushesBatchOnShutdown` |
| `Shutdown` drains channel | same test + timeout on ctx |
| Non-blocking hot path | stress test optional: flood `LogHTTP` without blocking (manual or `testing.B`) |
| No panic in handlers | nil `*AxiomHandler` helpers; full channel drop |
| No Axiom SDK | `go.mod` unchanged |
| Mirrors Rust event shapes | JSON field assertions in test |
| `go test ./internal/logging/...` | CI-local command |

---

## Out of scope (this task)

- Tower/Axum HTTP middleware for HTTP logging (Rust `AxiomLogLayer`) — future `internal/httpmiddleware` task
- Reading env inside `internal/logging` — credentials via `AxiomOptions` only
- `AXIOM_BATCH_SIZE` / `AXIOM_FLUSH_MS` on `config.Config` — use defaults in `AxiomOptions` with functional options pattern `logging.WithBatchSize(100)` if env wiring comes later

---

## Self-review (spec coverage)

| Spec item | Task |
|-----------|------|
| `logger.go` `New` | Task 4 |
| `axiom.go` handler + flusher | Task 3 |
| `Shutdown(ctx)` | Task 3 |
| Helpers | Task 2 |
| `logger_test.go` + httptest | Tasks 1–4 |
| No SDK | File map |
| `internal/config` pattern only at wire-up | Task 5 |
| Non-blocking, no panic | Task 3 design notes |

---

**Plan saved to:** `docs/superpowers/plans/2026-06-15-internal-logging-axiom.md`

**Execution options:**

1. **Subagent-driven (recommended)** — one subagent per task, review between tasks (`superpowers:subagent-driven-development`).
2. **Inline** — run tasks 1→4 in this session (`superpowers:executing-plans`).

Which approach do you want?