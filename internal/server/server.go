// Package server wires Fiber v3 with all ConnectRPC services and middleware.
package server

import (
	"net/http"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/adaptor"
	"github.com/gofiber/fiber/v3/middleware/compress"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"

	"github.com/pactum-computers/parley/gen/parley/guild/v1/guildv1connect"
	"github.com/pactum-computers/parley/gen/parley/identity/v1/identityv1connect"
	"github.com/pactum-computers/parley/gen/parley/leaderboard/v1/leaderboardv1connect"
	"github.com/pactum-computers/parley/gen/parley/matchmaking/v1/matchmakingv1connect"
	"github.com/pactum-computers/parley/gen/parley/stats/v1/statsv1connect"
	"github.com/pactum-computers/parley/gen/parley/tournament/v1/tournamentv1connect"
	"github.com/pactum-computers/parley/gen/parley/user/v1/userv1connect"
	"github.com/pactum-computers/parley/internal/handlers"
	"github.com/pactum-computers/parley/internal/services"
)

// Deps holds all service dependencies for the Fiber app.
type Deps struct {
	Identity    *services.IdentityService
	Guild       *services.GuildService
	User        *services.UserSettingsService
	Leaderboard *services.LeaderboardService
	Match       *services.MatchService
	Tournament  *services.TournamentService // nil = skip tournament routes
	Stats       *services.StatsService

	// ReadyCheck is called by GET /ready. Return nil for READY, non-nil for NOT READY.
	// If nil, /ready always returns 200.
	ReadyCheck func() error
}

// New constructs a Fiber v3 app with all middleware and routes wired.
func New(deps Deps) *fiber.App {
	app := fiber.New(fiber.Config{
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	})

	// Middleware
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(compress.New())
	app.Use(requestid.New())

	// Health and readiness
	app.Get("/health", func(c fiber.Ctx) error {
		return c.SendString("OK")
	})
	app.Get("/ready", func(c fiber.Ctx) error {
		if deps.ReadyCheck != nil {
			if err := deps.ReadyCheck(); err != nil {
				return c.Status(fiber.StatusServiceUnavailable).SendString("NOT READY")
			}
		}
		return c.SendString("READY")
	})
	mountMetrics(app)

	// Stats REST endpoint: GET /stats/:username
	statsREST := adaptor.HTTPHandler(http.HandlerFunc(handlers.StatsRESTHandler(deps.Stats)))
	app.Get("/stats/:username", statsREST)

	// ConnectRPC services
	p, h := identityv1connect.NewIdentityServiceHandler(handlers.NewIdentityHandler(deps.Identity))
	mountConnect(app, p, h)

	p, h = guildv1connect.NewGuildSettingsServiceHandler(handlers.NewGuildHandler(deps.Guild))
	mountConnect(app, p, h)

	p, h = userv1connect.NewUserSettingsServiceHandler(handlers.NewUserHandler(deps.User))
	mountConnect(app, p, h)

	p, h = leaderboardv1connect.NewLeaderboardServiceHandler(handlers.NewLeaderboardHandler(deps.Leaderboard))
	mountConnect(app, p, h)

	p, h = matchmakingv1connect.NewMatchmakingServiceHandler(handlers.NewMatchHandler(deps.Match))
	mountConnect(app, p, h)

	p, h = statsv1connect.NewStatsServiceHandler(handlers.NewStatsHandler(deps.Stats))
	mountConnect(app, p, h)

	if deps.Tournament != nil {
		p, h = tournamentv1connect.NewTournamentServiceHandler(handlers.NewTournamentHandler(deps.Tournament))
		mountConnect(app, p, h)
	}

	return app
}

// mountConnect registers all routes under a connect service prefix.
// path is e.g. "/parley.identity.v1.IdentityService/".
// The generated handler dispatches by r.URL.Path internally.
func mountConnect(app *fiber.App, path string, handler http.Handler) {
	h := adaptor.HTTPHandler(handler)
	app.Post(path+"*", h)
}
