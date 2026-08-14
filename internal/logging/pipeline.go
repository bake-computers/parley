package logging

import (
	"bytes"
	"context"
	"encoding/json"
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

// allowlistedEvents are the info-level event attrs shipped to Pipelines.
// Everything at warn or above ships regardless; everything else stays local.
var allowlistedEvents = map[string]bool{
	"request.completed":       true,
	"db.query":                true,
	"matchmaking.partitioned": true,
}

// PipelineOptions configures batched HTTP ingest to Cloudflare Pipelines.
type PipelineOptions struct {
	Token     string
	IngestURL string

	// BatchSize is the max records per POST. FlushInterval bounds the time a
	// record waits. BufferSize bounds the in-memory queue; overflow is dropped.
	BatchSize     int
	FlushInterval time.Duration
	BufferSize    int

	// HTTPClient overrides default client (tests only).
	HTTPClient *http.Client
}

func (o PipelineOptions) configured() bool {
	return o.IngestURL != "" && o.Token != ""
}

func (o PipelineOptions) withDefaults() PipelineOptions {
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
	return out
}

// PipelineHandler implements slog.Handler and ships records/events via batched POST.
type PipelineHandler struct {
	enabled bool
	enqueue func([]byte)

	attrs []slog.Attr
	group string

	mu       sync.Mutex
	closed   bool
	done     chan struct{}
	shutdown func()
}

// NewPipelineHandler starts a background flusher when configured; otherwise returns a no-op handler.
func NewPipelineHandler(opts PipelineOptions) (*PipelineHandler, error) {
	opts = opts.withDefaults()
	h := &PipelineHandler{
		enabled: opts.configured(),
	}
	if !h.enabled {
		h.enqueue = func([]byte) {}
		h.shutdown = func() {}
		h.done = make(chan struct{})
		close(h.done)
		return h, nil
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
	const flushTimeout = 10 * time.Second
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
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, opts.IngestURL, bytes.NewReader(body))
			if err != nil {
				batch = batch[:0]
				return
			}
			req.Header.Set("Authorization", "Bearer "+opts.Token)
			req.Header.Set("Content-Type", "application/json")
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
		// Regular flushes get a hard 10s cap so a hung ingest endpoint can
		// never stall the pipeline forever.
		flushWithTimeout := func() {
			ctx, cancel := context.WithTimeout(flushCtx, flushTimeout)
			defer cancel()
			flush(ctx)
		}

		for {
			select {
			case <-ticker.C:
				flushWithTimeout()
			case b, ok := <-ch:
				if !ok {
					shutdownFlush()
					return
				}
				batch = append(batch, json.RawMessage(b))
				if len(batch) >= opts.BatchSize {
					flushWithTimeout()
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
							flushWithTimeout()
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

// Enabled reports whether the handler may receive records at the given level.
// Info and above are inspected so allowlisted info events (request.completed,
// db.query, matchmaking.partitioned) can ship; debug never ships anywhere.
func (h *PipelineHandler) Enabled(_ context.Context, level slog.Level) bool {
	if !h.enabled {
		return false
	}
	return level >= slog.LevelInfo
}

// Handle enqueues a slog record without blocking, applying the allowlist:
// warn/error always ship, info ships only for allowlisted event attrs.
func (h *PipelineHandler) Handle(_ context.Context, r slog.Record) error {
	if !h.enabled {
		return nil
	}
	if r.Level < slog.LevelWarn && !allowlisted(r) {
		return nil
	}
	b := h.recordJSON(r)
	h.enqueue(b)
	return nil
}

// allowlisted reports whether the record carries an allowlisted event attr.
func allowlisted(r slog.Record) bool {
	var event string
	r.Attrs(func(a slog.Attr) bool {
		if a.Key == "event" {
			if s, ok := a.Value.Any().(string); ok {
				event = s
			}
			return false
		}
		return true
	})
	return allowlistedEvents[event]
}

func (h *PipelineHandler) recordJSON(r slog.Record) []byte {
	m := map[string]any{
		"event":   "log",
		"service": ServiceEngine,
		"ts":      r.Time.UTC().Format(time.RFC3339Nano),
		"level":   levelString(r.Level),
		"message": r.Message,
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

// withDerived returns a handler with additional pre-record attributes.
func (h *PipelineHandler) withDerived(attrs []slog.Attr, group string) *PipelineHandler {
	return &PipelineHandler{
		enabled: h.enabled,
		enqueue: h.enqueue,
		attrs:   attrs,
		group:   group,
	}
}

// WithAttrs returns a handler with additional pre-record attributes.
func (h *PipelineHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	if len(attrs) == 0 {
		return h
	}
	merged := append(append([]slog.Attr{}, h.attrs...), attrs...)
	return h.withDerived(merged, h.group)
}

// WithGroup returns a handler with a group name for nested attributes.
func (h *PipelineHandler) WithGroup(name string) slog.Handler {
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
func (h *PipelineHandler) Shutdown(ctx context.Context) error {
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

var _ slog.Handler = (*PipelineHandler)(nil)
