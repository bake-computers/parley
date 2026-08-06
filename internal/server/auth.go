package server

import (
	"crypto/subtle"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// requireEngineAuth rejects every request that does not present
// "Authorization: Bearer <secret>", except operational probes. The engine
// previously relied on network topology (the Cloudflare VPC binding) as its
// only authentication; this gate makes reachability not imply authorization.
func requireEngineAuth(secret string) fiber.Handler {
	// Trim so docker/.env and `echo | wrangler secret put` trailing newlines
	// do not desync the engine from edge callers.
	secret = strings.TrimSpace(secret)
	want := []byte("Bearer " + secret)
	return func(c fiber.Ctx) error {
		switch c.Path() {
		case "/health", "/ready":
			return c.Next()
		}
		got := strings.TrimSpace(c.Get(fiber.HeaderAuthorization))
		if secret == "" || subtle.ConstantTimeCompare([]byte(got), want) != 1 {
			return c.SendStatus(fiber.StatusUnauthorized)
		}
		return c.Next()
	}
}
