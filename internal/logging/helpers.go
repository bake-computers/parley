package logging

// LogHTTP enqueues an HTTP lifecycle event (mirrors src/logging.rs log_http).
func LogHTTP(h *AxiomHandler, method, path string, status uint16, durationMS float64, userAgent, contentType, origin *string) {
	if h == nil || !h.EnabledForHelpers() {
		return
	}
	h.enqueueDomain(encodeHTTPEvent(method, path, status, durationMS, userAgent, contentType, origin))
}

// LogDB enqueues a database query event.
func LogDB(h *AxiomHandler, operation, table string, durationMS float64, errMsg *string) {
	if h == nil || !h.EnabledForHelpers() {
		return
	}
	h.enqueueDomain(encodeDBEvent(operation, table, durationMS, errMsg))
}

// LogCache enqueues a cache hit/miss/stale event.
func LogCache(h *AxiomHandler, action, game string, usernameHash *string) {
	if h == nil || !h.EnabledForHelpers() {
		return
	}
	h.enqueueDomain(encodeCacheEvent(action, game, usernameHash))
}

// LogError enqueues a handler-level error event.
func LogError(h *AxiomHandler, service, code, message string, path *string) {
	if h == nil || !h.EnabledForHelpers() {
		return
	}
	h.enqueueDomain(encodeErrorEvent(service, code, message, path))
}
