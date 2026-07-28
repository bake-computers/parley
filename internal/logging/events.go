package logging

import (
	"encoding/json"
	"time"
)

func encodeEvent(fields map[string]any) []byte {
	b, err := json.Marshal(fields)
	if err != nil {
		return nil
	}
	return b
}

func baseDomain(event, level string) map[string]any {
	return map[string]any{
		"event":   event,
		"level":   level,
		"service": ServiceEngine,
		"time":    time.Now().UTC().Format(time.RFC3339Nano),
	}
}

func httpLevel(status uint16) string {
	switch {
	case status >= 500:
		return "error"
	case status >= 400:
		return "warn"
	default:
		return "info"
	}
}

func encodeHTTPEvent(
	method, path string,
	status uint16,
	durationMS float64,
	userAgent, contentType, origin *string,
) []byte {
	m := baseDomain("http", httpLevel(status))
	m["method"] = method
	m["path"] = path
	m["status"] = status
	m["duration_ms"] = durationMS
	if userAgent != nil {
		m["user_agent"] = *userAgent
	}
	if contentType != nil {
		m["content_type"] = *contentType
	}
	if origin != nil {
		m["origin"] = *origin
	}
	return encodeEvent(m)
}

func encodeDBEvent(operation, table string, durationMS float64, errMsg *string) []byte {
	level := "info"
	if errMsg != nil {
		level = "error"
	}
	m := baseDomain("db", level)
	m["operation"] = operation
	m["table"] = table
	m["duration_ms"] = durationMS
	if errMsg != nil {
		m["error"] = *errMsg
	}
	return encodeEvent(m)
}

func encodeCacheEvent(action, game string, usernameHash *string) []byte {
	// Cache hit/miss noise: debug so Axiom filters don't treat every hit as info.
	m := baseDomain("cache", "debug")
	m["action"] = action
	m["game"] = game
	if usernameHash != nil {
		m["username_hash"] = *usernameHash
	}
	return encodeEvent(m)
}

func encodeErrorEvent(service, code, message string, path *string) []byte {
	m := baseDomain("error", "error")
	// Domain "service" is the RPC/handler name; keep engine as source service.
	m["handler"] = service
	m["code"] = code
	m["message"] = message
	if path != nil {
		m["path"] = *path
	}
	return encodeEvent(m)
}
