package logging

import "encoding/json"

func encodeEvent(fields map[string]any) []byte {
	b, err := json.Marshal(fields)
	if err != nil {
		return nil
	}
	return b
}

func encodeHTTPEvent(
	method, path string,
	status uint16,
	durationMS float64,
	userAgent, contentType, origin *string,
) []byte {
	m := map[string]any{
		"event":       "http",
		"method":      method,
		"path":        path,
		"status":      status,
		"duration_ms": durationMS,
	}
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
	m := map[string]any{
		"event":       "db",
		"operation":   operation,
		"table":       table,
		"duration_ms": durationMS,
	}
	if errMsg != nil {
		m["error"] = *errMsg
	}
	return encodeEvent(m)
}

func encodeCacheEvent(action, game string, usernameHash *string) []byte {
	m := map[string]any{
		"event":  "cache",
		"action": action,
		"game":   game,
	}
	if usernameHash != nil {
		m["username_hash"] = *usernameHash
	}
	return encodeEvent(m)
}

func encodeErrorEvent(service, code, message string, path *string) []byte {
	m := map[string]any{
		"event":   "error",
		"service": service,
		"code":    code,
		"message": message,
	}
	if path != nil {
		m["path"] = *path
	}
	return encodeEvent(m)
}
