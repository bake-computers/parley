package server

import (
	"log/slog"
	"testing"
)

func attrsToMap(t *testing.T, attrs []any) map[string]slog.Value {
	t.Helper()
	m := map[string]slog.Value{}
	for i := 0; i+1 < len(attrs); i += 2 {
		key, ok := attrs[i].(string)
		if !ok {
			t.Fatalf("expected string attr key, got %T", attrs[i])
		}
		m[key] = slog.AnyValue(attrs[i+1])
	}
	return m
}

func TestRequestLogEvent_Shape(t *testing.T) {
	t.Parallel()
	level, msg, attrs := requestLogEvent(
		"POST",
		"/parley.matchmaking.v1.MatchmakingService/CreateMatch",
		200,
		12.4,
		"req-1",
		"1.2.3.4",
		"parley-web",
		512,
		"",
	)
	if level != slog.LevelInfo {
		t.Fatalf("level %v", level)
	}
	if msg != "POST /parley.matchmaking.v1.MatchmakingService/CreateMatch 200 (12.4ms)" {
		t.Fatalf("message %q", msg)
	}

	m := attrsToMap(t, attrs)
	if m["event"].String() != "request.completed" {
		t.Fatalf("event %v", m["event"])
	}
	if m["where"].String() != "engine POST /parley.matchmaking.v1.MatchmakingService/CreateMatch" {
		t.Fatalf("where %v", m["where"])
	}
	if m["request_id"].String() != "req-1" {
		t.Fatalf("request_id %v", m["request_id"])
	}
	if m["outcome"].String() != "success" {
		t.Fatalf("outcome %v", m["outcome"])
	}
	if m["duration_ms"].Float64() != 12.4 {
		t.Fatalf("duration_ms %v", m["duration_ms"])
	}

	httpGroup := map[string]slog.Value{}
	for _, a := range m["http"].Group() {
		httpGroup[a.Key] = a.Value
	}
	if httpGroup["method"].String() != "POST" {
		t.Fatalf("http.method %v", httpGroup["method"])
	}
	if httpGroup["path"].String() != "/parley.matchmaking.v1.MatchmakingService/CreateMatch" {
		t.Fatalf("http.path %v", httpGroup["path"])
	}
	if httpGroup["status"].Int64() != 200 {
		t.Fatalf("http.status %v", httpGroup["status"])
	}
	if httpGroup["client_ip"].String() != "1.2.3.4" {
		t.Fatalf("http.client_ip %v", httpGroup["client_ip"])
	}
	if httpGroup["user_agent"].String() != "parley-web" {
		t.Fatalf("http.user_agent %v", httpGroup["user_agent"])
	}
	if httpGroup["bytes_out"].Int64() != 512 {
		t.Fatalf("http.bytes_out %v", httpGroup["bytes_out"])
	}
}

func TestRequestLogEvent_LevelsAndOutcome(t *testing.T) {
	t.Parallel()

	level, _, attrs := requestLogEvent("GET", "/x", 400, 1, "", "", "", 0, "")
	if level != slog.LevelInfo {
		t.Fatalf("4xx should stay info, got %v", level)
	}
	if attrsToMap(t, attrs)["outcome"].String() != "client_error" {
		t.Fatalf("4xx outcome %v", attrsToMap(t, attrs)["outcome"])
	}

	level, _, attrs = requestLogEvent("GET", "/x", 500, 1, "", "", "", 0, "")
	if level != slog.LevelError {
		t.Fatalf("5xx should be error, got %v", level)
	}
	if attrsToMap(t, attrs)["outcome"].String() != "error" {
		t.Fatalf("5xx outcome %v", attrsToMap(t, attrs)["outcome"])
	}

	level, _, attrs = requestLogEvent("GET", "/x", 404, 1, "", "", "", 0, "Not Found")
	if level != slog.LevelInfo {
		t.Fatalf("4xx with errMsg should stay info, got %v", level)
	}
	if attrsToMap(t, attrs)["outcome"].String() != "client_error" {
		t.Fatalf("4xx with errMsg outcome %v", attrsToMap(t, attrs)["outcome"])
	}

	level, _, attrs = requestLogEvent("POST", "/x", 200, 1, "", "", "", 0, "boom")
	if level != slog.LevelError {
		t.Fatalf("handler error should be error, got %v", level)
	}
	m := attrsToMap(t, attrs)
	if m["outcome"].String() != "error" {
		t.Fatalf("handler error outcome %v", m["outcome"])
	}
	errGroup := map[string]slog.Value{}
	for _, a := range m["error"].Group() {
		errGroup[a.Key] = a.Value
	}
	if errGroup["message"].String() != "boom" {
		t.Fatalf("error.message %v", errGroup["message"])
	}
}
