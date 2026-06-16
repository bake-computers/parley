package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

const (
	defaultBatchSize     = 100
	defaultFlushInterval = time.Second
	defaultBufferSize    = 2048
)

// AxiomOptions configures batched HTTP ingest to Axiom (no official SDK).
type AxiomOptions struct {
	Token         string
	Dataset       string
	OrgID         string
	Edge          string
	EdgeURL       string
	Enabled       bool
	BatchSize     int
	FlushInterval time.Duration
	BufferSize    int

	// IngestURL overrides resolved URL (tests only).
	IngestURL string
	// HTTPClient overrides default client (tests only).
	HTTPClient *http.Client
}

func (o AxiomOptions) configured() bool {
	return o.Enabled && o.Token != ""
}

func (o AxiomOptions) withDefaults() AxiomOptions {
	out := o
	if out.BatchSize <= 0 {
		out.BatchSize = defaultBatchSize
	}
	if out.FlushInterval <= 0 {
		out.FlushInterval = defaultFlushInterval
	}
	if out.BufferSize <= 0 {
		out.BufferSize = defaultBufferSize
	}
	if out.Dataset == "" {
		out.Dataset = "parley"
	}
	return out
}

// AxiomHandler implements slog.Handler and ships records/events via batched POST.
type AxiomHandler struct {
	enabled bool
	enqueue func([]byte)
	level   slog.Leveler

	attrs []slog.Attr
	group string

	mu       sync.Mutex
	closed   bool
	done     chan struct{}
	shutdown func()
}

// NewAxiomHandler starts a background flusher when configured; otherwise returns a no-op handler.
func NewAxiomHandler(opts AxiomOptions) (*AxiomHandler, error) {
	opts = opts.withDefaults()
	h := &AxiomHandler{
		enabled: opts.configured(),
		level:   slog.LevelInfo,
	}
	if !h.enabled {
		h.enqueue = func([]byte) {}
		h.shutdown = func() {}
		h.done = make(chan struct{})
		close(h.done)
		return h, nil
	}

	ingestURL := opts.IngestURL
	if ingestURL == "" {
		ingestURL = ResolveIngestURL(opts.Dataset, opts.Edge, opts.EdgeURL)
	}
	client := opts.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}

	ch := make(chan []byte, opts.BufferSize)
	h.done = make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)

	stop := make(chan struct{})
	flushCtx, cancelFlush := context.WithCancel(context.Background())
	const shutdownFlushTimeout = 30 * time.Second
	h.shutdown = func() { close(stop) }

	h.enqueue = func(b []byte) {
		if b == nil {
			return
		}
		select {
		case ch <- b:
		default:
		}
	}

	go func() {
		defer wg.Done()
		defer close(h.done)
		defer cancelFlush()

		batch := make([]json.RawMessage, 0, opts.BatchSize)
		ticker := time.NewTicker(opts.FlushInterval)
		defer ticker.Stop()

		flush := func(ctx context.Context) {
			if len(batch) == 0 {
				return
			}
			body, err := json.Marshal(batch)
			if err != nil {
				batch = batch[:0]
				return
			}
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, ingestURL, bytes.NewReader(body))
			if err != nil {
				batch = batch[:0]
				return
			}
			req.Header.Set("Authorization", "Bearer "+opts.Token)
			req.Header.Set("Content-Type", "application/json")
			if opts.OrgID != "" {
				req.Header.Set("X-Axiom-Org-Id", opts.OrgID)
			}
			resp, err := client.Do(req)
			if err != nil {
				batch = batch[:0]
				return
			}
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			batch = batch[:0]
		}

		shutdownFlush := func() {
			ctx, cancel := context.WithTimeout(flushCtx, shutdownFlushTimeout)
			defer cancel()
			flush(ctx)
		}

		for {
			select {
			case <-ticker.C:
				flush(flushCtx)
			case b, ok := <-ch:
				if !ok {
					shutdownFlush()
					return
				}
				batch = append(batch, json.RawMessage(b))
				if len(batch) >= opts.BatchSize {
					flush(flushCtx)
				}
			case <-stop:
				for {
					select {
					case b, ok := <-ch:
						if !ok {
							shutdownFlush()
							return
						}
						batch = append(batch, json.RawMessage(b))
						if len(batch) >= opts.BatchSize {
							flush(flushCtx)
						}
					default:
						shutdownFlush()
						return
					}
				}
			}
		}
	}()

	return h, nil
}

// Enabled reports whether the handler handles records at the given level.
func (h *AxiomHandler) Enabled(_ context.Context, level slog.Level) bool {
	if !h.enabled {
		return false
	}
	return level >= h.level.Level()
}

// Handle enqueues a slog record without blocking.
func (h *AxiomHandler) Handle(_ context.Context, r slog.Record) error {
	if !h.enabled {
		return nil
	}
	b := h.recordJSON(r)
	h.enqueue(b)
	return nil
}

func (h *AxiomHandler) recordJSON(r slog.Record) []byte {
	m := map[string]any{
		"event": "log",
		"time":  r.Time.UTC().Format(time.RFC3339Nano),
		"level": r.Level.String(),
		"msg":   r.Message,
	}
	if h.group != "" {
		m["group"] = h.group
	}
	for _, a := range h.attrs {
		putAttr(m, a)
	}
	r.Attrs(func(a slog.Attr) bool {
		putAttr(m, a)
		return true
	})
	return encodeEvent(m)
}

func putAttr(m map[string]any, a slog.Attr) {
	v := a.Value.Any()
	if a.Equal(slog.Attr{}) {
		return
	}
	switch a.Value.Kind() {
	case slog.KindGroup:
		g := a.Value.Group()
		nested := map[string]any{}
		for _, ga := range g {
			putAttr(nested, ga)
		}
		m[a.Key] = nested
	default:
		m[a.Key] = v
	}
}

// WithAttrs returns a handler with additional pre-record attributes.
func (h *AxiomHandler) withDerived(attrs []slog.Attr, group string) *AxiomHandler {
	return &AxiomHandler{
		enabled: h.enabled,
		enqueue: h.enqueue,
		level:   h.level,
		attrs:   attrs,
		group:   group,
	}
}

// WithAttrs returns a handler with additional pre-record attributes.
func (h *AxiomHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	if len(attrs) == 0 {
		return h
	}
	merged := append(append([]slog.Attr{}, h.attrs...), attrs...)
	return h.withDerived(merged, h.group)
}

// WithGroup returns a handler with a group name for nested attributes.
func (h *AxiomHandler) WithGroup(name string) slog.Handler {
	if name == "" {
		return h
	}
	g := name
	if h.group != "" {
		g = h.group + "." + name
	}
	return h.withDerived(append([]slog.Attr{}, h.attrs...), g)
}

// Shutdown drains the batch channel and waits for the worker to exit.
func (h *AxiomHandler) Shutdown(ctx context.Context) error {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-h.done:
			return nil
		}
	}
	h.closed = true
	h.mu.Unlock()

	h.shutdown()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-h.done:
		return nil
	}
}

// EnabledForHelpers reports whether domain helpers should enqueue events.
func (h *AxiomHandler) EnabledForHelpers() bool {
	return h != nil && h.enabled
}

func (h *AxiomHandler) enqueueDomain(b []byte) {
	if h == nil || !h.enabled || b == nil {
		return
	}
	h.enqueue(b)
}

// EnqueueRaw is used by tests to inject payloads.
func (h *AxiomHandler) EnqueueRaw(b []byte) {
	h.enqueueDomain(b)
}

var _ slog.Handler = (*AxiomHandler)(nil)

// noop helper for fmt in case of future debug
var _ = fmt.Sprintf
