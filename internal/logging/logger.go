package logging

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
)

const ServiceEngine = "engine"

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

// levelString returns Axiom-friendly lowercase severity text.
func levelString(level slog.Level) string {
	switch {
	case level >= slog.LevelError:
		return "error"
	case level >= slog.LevelWarn:
		return "warn"
	case level >= slog.LevelInfo:
		return "info"
	default:
		return "debug"
	}
}

func jsonHandlerOptions(level string) *slog.HandlerOptions {
	lvl := parseLevel(level)
	return &slog.HandlerOptions{
		Level: lvl,
		// Lowercase level so Axiom severity mapping matches worker/discord events.
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			if a.Key == slog.LevelKey {
				if l, ok := a.Value.Any().(slog.Level); ok {
					return slog.String(slog.LevelKey, levelString(l))
				}
			}
			return a
		},
	}
}

func stderrHandler(level string) slog.Handler {
	return slog.NewJSONHandler(os.Stderr, jsonHandlerOptions(level))
}

func jsonWriterHandler(level string, w io.Writer) slog.Handler {
	return slog.NewJSONHandler(w, jsonHandlerOptions(level))
}

func newLogger(level string, stdout slog.Handler, axiom *AxiomHandler) *slog.Logger {
	var h = stdout
	if axiom != nil && axiom.enabled {
		h = &multiHandler{handlers: []slog.Handler{stdout, axiom}}
	}
	return slog.New(h).With("service", ServiceEngine)
}

// New builds the root JSON logger; tees to Axiom when opts are configured.
// Prefer NewWithAxiom when you need to Shutdown the handler.
func New(level string, opts AxiomOptions) *slog.Logger {
	opts.Level = level
	axiom, err := NewAxiomHandler(opts)
	if err != nil {
		return slog.New(stderrHandler(level)).With("service", ServiceEngine)
	}
	return newLogger(level, stderrHandler(level), axiom)
}

// NewWithWriter is like New but writes logs to w (for tests). Always JSON.
func NewWithWriter(level string, w io.Writer, opts AxiomOptions) *slog.Logger {
	opts.Level = level
	stdout := jsonWriterHandler(level, w)
	axiom, err := NewAxiomHandler(opts)
	if err != nil {
		return slog.New(stdout).With("service", ServiceEngine)
	}
	return newLogger(level, stdout, axiom)
}

// NewWithAxiom attaches an existing Axiom handler (caller owns Shutdown).
func NewWithAxiom(level string, axiom *AxiomHandler) *slog.Logger {
	if axiom != nil {
		axiom.setMinLevel(parseLevel(level))
	}
	return newLogger(level, stderrHandler(level), axiom)
}
