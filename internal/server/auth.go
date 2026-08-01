package server

import (
	"crypto/subtle"

	"github.com/gofiber/fiber/v3"
)

// requireEngineAuth rejects every request that does not present
// "Authorization: Bearer <secret>", except operational probes. The engine
// previously relied on network topology (the Cloudflare VPC binding) as its
// only authentication; this gate makes reachability not imply authorization.
func requireEngineAuth(secret string) fiber.Handler {
	want := "Bearer " + secret
	return func(c fiber.Ctx) error {
		switch c.Path() {
		case "/health", "/ready", "/metrics":
			return c.Next()
		}
		got := c.Get(fiber.HeaderAuthorization)
		if secret == "" || subtle.ConstantTimeCompare([]byte(got), []byte(want)) != 1 {
			return c.SendStatus(fiber.StatusUnauthorized)
		}
		return c.Next()
	}
}
