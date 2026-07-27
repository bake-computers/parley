// Package server wires Fiber v3 with all ConnectRPC services and middleware.
package server

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/adaptor"
	"github.com/gofiber/fiber/v3/middleware/compress"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/bake-computers/parley/gen/parley/guild/v1/guildv1connect"
	"github.com/bake-computers/parley/gen/parley/identity/v1/identityv1connect"
	"github.com/bake-computers/parley/gen/parley/matchmaking/v1/matchmakingv1connect"
	"github.com/bake-computers/parley/gen/parley/stats/v1/statsv1connect"
	"github.com/bake-computers/parley/gen/parley/tournament/v1/tournamentv1connect"
	"github.com/bake-computers/parley/gen/parley/user/v1/userv1connect"
	"github.com/bake-computers/parley/internal/handlers"
	"github.com/bake-computers/parley/internal/services"
)

// Deps holds all service dependencies for the Fiber app.
type Deps struct {
	Identity   *services.IdentityService
	Guild      *services.GuildService
	User       *services.UserSettingsService
	Match      *services.MatchService
	Tournament *services.TournamentService // nil = skip tournament routes
	Stats      *services.StatsService

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
	p, h := identityv1connect.NewIdentityServiceHandler(handlers.NewIdentityHandler(deps.Identity), connectOptions...)
	mountConnect(app, p, h)

	p, h = guildv1connect.NewGuildSettingsServiceHandler(handlers.NewGuildHandler(deps.Guild), connectOptions...)
	mountConnect(app, p, h)

	p, h = userv1connect.NewUserSettingsServiceHandler(handlers.NewUserHandler(deps.User), connectOptions...)
	mountConnect(app, p, h)

	p, h = matchmakingv1connect.NewMatchmakingServiceHandler(handlers.NewMatchHandler(deps.Match), connectOptions...)
	mountConnect(app, p, h)

	p, h = statsv1connect.NewStatsServiceHandler(handlers.NewStatsHandler(deps.Stats), connectOptions...)
	mountConnect(app, p, h)

	if deps.Tournament != nil {
		p, h = tournamentv1connect.NewTournamentServiceHandler(handlers.NewTournamentHandler(deps.Tournament), connectOptions...)
		mountConnect(app, p, h)
	}

	return app
}

// connectOptions are shared across all ConnectRPC handlers. The custom JSON codec
// sets EmitUnpopulated so protojson serializes zero values (false booleans, 0
// numbers) instead of omitting them; the web worker cannot otherwise tell a saved
// `false` from an absent field and would fall back to its own default, reverting
// the user's change. Only JSON requests use this codec — binary protobuf is untouched.
var connectOptions = []connect.HandlerOption{
	connect.WithCodec(&emitDefaultJSONCodec{name: "json"}),
	connect.WithCodec(&emitDefaultJSONCodec{name: "json; charset=utf-8"}),
}

// emitDefaultJSONCodec mirrors connect's protoJSONCodec but emits unpopulated fields.
type emitDefaultJSONCodec struct {
	name string
}

func (c *emitDefaultJSONCodec) Name() string { return c.name }

func (c *emitDefaultJSONCodec) Marshal(message any) ([]byte, error) {
	protoMessage, ok := message.(proto.Message)
	if !ok {
		return nil, fmt.Errorf("expected proto.Message, got %T", message)
	}
	return protojson.MarshalOptions{EmitUnpopulated: true}.Marshal(protoMessage)
}

func (c *emitDefaultJSONCodec) MarshalAppend(dst []byte, message any) ([]byte, error) {
	protoMessage, ok := message.(proto.Message)
	if !ok {
		return nil, fmt.Errorf("expected proto.Message, got %T", message)
	}
	return protojson.MarshalOptions{EmitUnpopulated: true}.MarshalAppend(dst, protoMessage)
}

func (c *emitDefaultJSONCodec) Unmarshal(data []byte, message any) error {
	protoMessage, ok := message.(proto.Message)
	if !ok {
		return fmt.Errorf("expected proto.Message, got %T", message)
	}
	if len(data) == 0 {
		return fmt.Errorf("zero-length payload is not a valid JSON object")
	}
	return protojson.UnmarshalOptions{DiscardUnknown: true}.Unmarshal(data, protoMessage)
}

func (c *emitDefaultJSONCodec) IsBinary() bool { return false }

// mountConnect registers all routes under a connect service prefix.
// path is e.g. "/parley.identity.v1.IdentityService/".
// The generated handler dispatches by r.URL.Path internally.
func mountConnect(app *fiber.App, path string, handler http.Handler) {
	h := adaptor.HTTPHandler(handler)
	app.Post(path+"*", h)
}
