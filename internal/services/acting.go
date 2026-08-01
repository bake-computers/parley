package services

import (
	"net/http"
	"strings"
)

// ActingUserIDHeader carries the Discord user id the authenticated edge
// (worker/web) verified for the request. It is trustworthy only because
// the shared-secret gate in internal/server has already admitted the
// request; handlers use it to authorize destructive and self-targeting
// RPCs instead of trusting request-body identity fields.
const ActingUserIDHeader = "X-Parley-Acting-Discord-User-Id"

// ActingDiscordUserID returns the verified caller identity asserted by
// the edge, or "" when the edge did not verify a user for this request.
func ActingDiscordUserID(h http.Header) string {
	return strings.TrimSpace(h.Get(ActingUserIDHeader))
}
