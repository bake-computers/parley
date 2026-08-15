package logging

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
	"time"
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

// levelString returns lowercase severity text matching the wide-event schema.
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
		// Keys matching the wide-event schema: lowercase level, msg→message,
		// time→ts.
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			switch a.Key {
			case slog.LevelKey:
				if l, ok := a.Value.Any().(slog.Level); ok {
					return slog.String(slog.LevelKey, levelString(l))
				}
			case slog.MessageKey:
				return slog.String("message", a.Value.String())
			case slog.TimeKey:
				return slog.String("ts", a.Value.Time().UTC().Format(time.RFC3339Nano))
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

func newLogger(level string, stdout slog.Handler, pipeline *PipelineHandler) *slog.Logger {
	var h = stdout
	if pipeline != nil && pipeline.enabled {
		h = &multiHandler{handlers: []slog.Handler{stdout, pipeline}}
	}
	log := slog.New(h).With("service", ServiceEngine)
	if host, err := os.Hostname(); err == nil && host != "" {
		log = log.With("env", slog.GroupValue(slog.String("hostname", host)))
	}
	return log
}

// New builds the root JSON logger; tees to the pipeline handler when opts are
// configured. Prefer NewWithPipeline when you need to Shutdown the handler.
func New(level string, opts PipelineOptions) *slog.Logger {
	pipeline, err := NewPipelineHandler(opts)
	if err != nil {
		return slog.New(stderrHandler(level)).With("service", ServiceEngine)
	}
	return newLogger(level, stderrHandler(level), pipeline)
}

// NewWithWriter is like New but writes logs to w (for tests). Always JSON.
func NewWithWriter(level string, w io.Writer, opts PipelineOptions) *slog.Logger {
	stdout := jsonWriterHandler(level, w)
	pipeline, err := NewPipelineHandler(opts)
	if err != nil {
		return slog.New(stdout).With("service", ServiceEngine)
	}
	return newLogger(level, stdout, pipeline)
}

// NewWithPipeline attaches an existing pipeline handler (caller owns Shutdown).
func NewWithPipeline(level string, pipeline *PipelineHandler) *slog.Logger {
	return newLogger(level, stderrHandler(level), pipeline)
}
