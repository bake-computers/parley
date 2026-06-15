# Fiber v3 Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `internal/server/server.go` — a Fiber v3 app that registers all 7 ConnectRPC services (39 RPCs), health/ready/stats endpoints, and standard middleware.

**Architecture:** Fiber v3 auto-adapts `http.Handler` — each generated `NewXxxServiceHandler` returns `(string, http.Handler)` which mounts directly via `app.Post(path, handler)`. A `ServerDeps` struct injects all service dependencies.

**Tech Stack:** Go 1.25, github.com/gofiber/fiber/v3, connectrpc.com/connect v1.20

---

## File Structure

| File | Responsibility |
|------|----------------|
| `internal/server/server.go` | `New(deps)` constructor, middleware, route registration |
| `internal/server/server_test.go` | httptest for /health and one RPC smoke test |

---

## Task 1: Add fiber v3 dependency

**Files:**
- Modify: `go.mod`

- [ ] **Step 1: Add fiber v3 to go.mod**

Run:
```bash
go get github.com/gofiber/fiber/v3@v3.3.0
```

Expected: `go.mod` updated with `github.com/gofiber/fiber/v3 v3.3.0`

- [ ] **Step 2: Verify go.sum updated**

Run:
```bash
go mod tidy
```

Expected: clean output, no errors

---

## Task 2: Create `internal/server/server.go`

**Files:**
- Create: `internal/server/server.go`

- [ ] **Step 1: Write the server package with deps struct and New()**

```go
package server

import (
	"net/http"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/compress"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/gofiber/fiber/v3/middleware/timeout"

	"github.com/parley-bot/parley/gen/parley/guild/v1/guildv1connect"
	"github.com/parley-bot/parley/gen/parley/identity/v1/identityv1connect"
	"github.com/parley-bot/parley/gen/parley/leaderboard/v1/leaderboardv1connect"
	"github.com/parley-bot/parley/gen/parley/matchmaking/v1/matchmakingv1connect"
	"github.com/parley-bot/parley/gen/parley/stats/v1/statsv1connect"
	"github.com/parley-bot/parley/gen/parley/tournament/v1/tournamentv1connect"
	"github.com/parley-bot/parley/gen/parley/user/v1/userv1connect"
	"github.com/parley-bot/parley/internal/handlers"
	"github.com/parley-bot/parley/internal/services"
)

// ServerDeps holds all service dependencies for the Fiber app.
type ServerDeps struct {
	Identity    *services.IdentityService
	Guild       *services.GuildService
	User        *services.UserSettingsService
	Leaderboard *services.LeaderboardService
	Match       *services.MatchService
	Tournament  *services.TournamentService
	Stats       *services.StatsService
}

// New constructs a Fiber v3 app with all middleware and routes wired.
func New(deps ServerDeps) *fiber.App {
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
		return c.SendString("READY")
	})

	// Stats REST endpoint
	statsREST := handlers.StatsRESTHandler(deps.Stats)
	app.Get("/stats/:username", func(c fiber.Ctx) error {
		// Rewrite path so the handler sees /stats/{username}
		r := c.Request()
		r.SetRequestURI("/stats/" + c.Params("username"))
		statsREST.ServeHTTP(c.Response(), c.Request())
		return nil
	})

	// ConnectRPC services — each returns (path, http.Handler)
	mountConnectService(app, identityv1connect.NewIdentityServiceHandler(
		handlers.NewIdentityHandler(deps.Identity),
	))
	mountConnectService(app, guildv1connect.NewGuildSettingsServiceHandler(
		handlers.NewGuildHandler(deps.Guild),
	))
	mountConnectService(app, userv1connect.NewUserSettingsServiceHandler(
		handlers.NewUserHandler(deps.User),
	))
	mountConnectService(app, leaderboardv1connect.NewLeaderboardServiceHandler(
		handlers.NewLeaderboardHandler(deps.Leaderboard),
	))
	mountConnectService(app, matchmakingv1connect.NewMatchmakingServiceHandler(
		handlers.NewMatchHandler(deps.Match),
	))
	mountConnectService(app, tournamentv1connect.NewTournamentServiceHandler(
		handlers.NewTournamentHandler(deps.Tournament),
	))
	mountConnectService(app, statsv1connect.NewStatsServiceHandler(
		handlers.NewStatsHandler(deps.Stats),
	))

	return app
}

// mountConnectService registers all routes under a connect service prefix.
// The generated handler already dispatches by full path internally,
// so we mount it as a catch-all under the service prefix.
func mountConnectService(app *fiber.App, path string, handler http.Handler) {
	// path is e.g. "/parley.identity.v1.IdentityService/"
	// The handler dispatches by r.URL.Path internally.
	app.Post(path+"*", func(c fiber.Ctx) error {
		handler.ServeHTTP(c.Response(), c.Request())
		return nil
	})
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
go build ./internal/server/...
```

Expected: clean build, no errors

---

## Task 3: Create `internal/server/server_test.go`

**Files:**
- Create: `internal/server/server_test.go`

- [ ] **Step 1: Write tests for /health and a connect RPC smoke test**

```go
package server_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/parley-bot/parley/internal/server"
	"github.com/parley-bot/parley/internal/services"
)

func newTestApp(t *testing.T) *fiber.App {
	t.Helper()
	deps := server.ServerDeps{
		Identity:    &services.IdentityService{},
		Guild:       &services.GuildService{},
		User:        &services.UserSettingsService{},
		Leaderboard: &services.LeaderboardService{},
		Match:       &services.MatchService{},
		Tournament:  &services.TournamentService{},
		Stats:       &services.StatsService{},
	}
	return server.New(deps)
}

func TestHealthEndpoint(t *testing.T) {
	app := newTestApp(t)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "OK" {
		t.Errorf("expected 'OK', got %q", string(body))
	}
}

func TestReadyEndpoint(t *testing.T) {
	app := newTestApp(t)

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIdentityServiceSmoke(t *testing.T) {
	app := newTestApp(t)

	// Send a LookupByUsername request with empty body to verify routing works.
	// The handler will return an error, but we verify the route exists.
	body, _ := json.Marshal(map[string]string{
		"username": "",
	})
	req := httptest.NewRequest(
		http.MethodPost,
		"/parley.identity.v1.IdentityService/LookupByUsername",
		bytes.NewReader(body),
	)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	// Should get a response (not 404) — the handler processes it.
	if resp.StatusCode == http.StatusNotFound {
		t.Error("route not found — connect service not mounted")
	}
}
```

- [ ] **Step 2: Run tests**

Run:
```bash
go test ./internal/server/... -v
```

Expected: all 3 tests pass

---

## Task 4: Verify full build

**Files:**
- (none)

- [ ] **Step 1: Run full build**

Run:
```bash
go build ./...
```

Expected: clean build

- [ ] **Step 2: Run linter**

Run:
```bash
golangci-lint run ./internal/server/...
```

Expected: no issues

---

## RPC Coverage Checklist

All 39 RPCs from Rust `src/connect.rs` are covered:

| Service | RPCs | Handler Constructor |
|---------|------|---------------------|
| Identity | 4 (LinkAccount, UnlinkAccount, LookupByDiscord, LookupByUsername) | `identityv1connect.NewIdentityServiceHandler` |
| Guild | 8 (GetGuildSettings, UpsertGuildSettings, GetMatchmakingRules, UpsertMatchmakingRules, GetNotificationSettings, UpsertNotificationSettings, GetMatchQuotas, UpsertMatchQuotas) | `guildv1connect.NewGuildSettingsServiceHandler` |
| User | 4 (GetUserSettings, UpsertUserSettings, ResolveLanguage, DeleteUserData) | `userv1connect.NewUserSettingsServiceHandler` |
| Leaderboard | 2 (GetLeaderboard, GetPlayerRank) | `leaderboardv1connect.NewLeaderboardServiceHandler` |
| Matchmaking | 10 (BuildTeams, ListGuildMembers, JoinQueue, LeaveQueue, GetQueueStatus, CreateCustomMatch, ReportMatchResult, GetMatch, ListMatches, GetMatchByUuid) | `matchmakingv1connect.NewMatchmakingServiceHandler` |
| Tournament | 9 (CreateTournament, GetTournament, ListTournaments, RegisterTeam, UpdateTeamRoster, UnregisterTeam, StartTournament, ReportBracketResult, CancelTournament) | `tournamentv1connect.NewTournamentServiceHandler` |
| Stats | 2 (FetchStats, FetchStatsCollection) | `statsv1connect.NewStatsServiceHandler` |

**Total: 39 RPCs** ✓

---

## Path Pattern

All routes follow the Rust pattern `POST /parley.{pkg}.v1.{Service}/{Method}`:
- `/parley.identity.v1.IdentityService/LinkAccount`
- `/parley.guild.v1.GuildSettingsService/GetGuildSettings`
- `/parley.user.v1.UserSettingsService/GetUserSettings`
- `/parley.leaderboard.v1.LeaderboardService/GetLeaderboard`
- `/parley.matchmaking.v1.MatchmakingService/BuildTeams`
- `/parley.tournament.v1.TournamentService/CreateTournament`
- `/parley.stats.v1.StatsService/FetchStats`

Plus REST: `GET /stats/{username}`
