package logging

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
)

type multiHandler struct {
	handlers []slog.Handler
}

func (m *multiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range m.handlers {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (m *multiHandler) Handle(ctx context.Context, r slog.Record) error {
	for _, h := range m.handlers {
		if h.Enabled(ctx, r.Level) {
			if err := h.Handle(ctx, r); err != nil {
				return err
			}
		}
	}
	return nil
}

func (m *multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	out := make([]slog.Handler, len(m.handlers))
	for i, h := range m.handlers {
		out[i] = h.WithAttrs(attrs)
	}
	return &multiHandler{handlers: out}
}

func (m *multiHandler) WithGroup(name string) slog.Handler {
	out := make([]slog.Handler, len(m.handlers))
	for i, h := range m.handlers {
		out[i] = h.WithGroup(name)
	}
	return &multiHandler{handlers: out}
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug", "trace":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func stderrHandler(level string) slog.Handler {
	lvl := parseLevel(level)
	opts := &slog.HandlerOptions{Level: lvl}
	if strings.EqualFold(level, "debug") || strings.EqualFold(level, "trace") {
		return slog.NewTextHandler(os.Stderr, opts)
	}
	return slog.NewJSONHandler(os.Stderr, opts)
}

func newLogger(level string, stdout slog.Handler, axiom *AxiomHandler) *slog.Logger {
	var h = stdout
	if axiom != nil && axiom.enabled {
		h = &multiHandler{handlers: []slog.Handler{stdout, axiom}}
	}
	return slog.New(h)
}

// New builds the root logger: text on stderr for debug/trace, else JSON; tees to Axiom when opts are configured.
func New(level string, opts AxiomOptions) *slog.Logger {
	axiom, err := NewAxiomHandler(opts)
	if err != nil {
		return slog.New(stderrHandler(level))
	}
	return newLogger(level, stderrHandler(level), axiom)
}

// NewWithWriter is like New but writes stdout logs to w (for tests).
func NewWithWriter(level string, w io.Writer, opts AxiomOptions) *slog.Logger {
	lvl := parseLevel(level)
	var stdout slog.Handler
	if strings.EqualFold(level, "debug") || strings.EqualFold(level, "trace") {
		stdout = slog.NewTextHandler(w, &slog.HandlerOptions{Level: lvl})
	} else {
		stdout = slog.NewJSONHandler(w, &slog.HandlerOptions{Level: lvl})
	}
	axiom, err := NewAxiomHandler(opts)
	if err != nil {
		return slog.New(stdout)
	}
	return newLogger(level, stdout, axiom)
}

// AxiomFromLogger returns the Axiom handler if New attached one (via stored reference).
// New stores axiom only inside multiHandler; callers should keep *AxiomHandler from NewAxiomHandler for Shutdown.
func NewWithAxiom(level string, axiom *AxiomHandler) *slog.Logger {
	return newLogger(level, stderrHandler(level), axiom)
}
