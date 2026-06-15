# Task 19 — Leaderboard Service (Go) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Task directive:** Do **not** commit unless the user explicitly asks. Skip all “Commit” steps.
>
> **Notepad:** After each task, append a one-line completion note to the **Implementation notepad** section at the bottom of this file (do not use a separate file).

**Goal:** Port `src/leaderboard.rs` + `src/handlers/leaderboard.rs` to Go as `internal/services/leaderboard.go` (Redis ZSET store + domain service) and `internal/handlers/leaderboard.go` (ConnectRPC thin handlers for `GetLeaderboard` and `GetPlayerRank`), returning `connect.CodeFailedPrecondition` when the store is nil (no `REDIS_URL`).

**Architecture:** A small `Store` interface mirrors the Rust `LeaderboardStore` read/write surface (`Top`, `PlayerRank`, `Count`, `Touch`, `Remove`). Production wiring uses `github.com/redis/go-redis/v9` against the same key format as Rust (`lb:{game}:{scope}:{kind}`). Unit/integration tests use `github.com/alicebob/miniredis/v2` or an in-memory ZSET mock implementing `Store`. `LeaderboardService` holds `Store` via constructor injection (no package-level mutable leaderboard). Handlers depend only on `*LeaderboardService` and implement `leaderboardv1connect.LeaderboardServiceHandler`. **No Postgres** on leaderboard read paths.

**Tech Stack:** Go 1.25, `connectrpc.com/connect`, `github.com/redis/go-redis/v9`, `github.com/alicebob/miniredis/v2`, generated protos under `gen/parley/leaderboard/v1`.

**Rust references:**

| Rust | Go |
|------|-----|
| `src/leaderboard.rs` | `internal/services/leaderboard.go` (+ tests) |
| `src/handlers/leaderboard.rs` | `internal/handlers/leaderboard.go` (+ tests) |
| `AppContext.leaderboard: Option<Arc<LeaderboardStore>>` | `*LeaderboardService` with `store Store` (nil when Redis absent) |
| HTTP `encode_error(SERVICE_UNAVAILABLE, "unavailable", …)` | `connect.NewError(connect.CodeFailedPrecondition, err)` per task spec |

**Generated Connect:**

- `gen/parley/leaderboard/v1/leaderboardv1connect/leaderboard.connect.go` — `LeaderboardServiceHandler`, `NewLeaderboardServiceHandler`
- `gen/parley/leaderboard/v1/leaderboard.pb.go` — request/response types

---

## File map

| Path | Action | Responsibility |
|------|--------|----------------|
| `internal/services/leaderboard.go` | create | `Kind`, `Entry`, `Store` interface, `RedisStore`, `LeaderboardService`, key helpers |
| `internal/services/leaderboard_test.go` | create | miniredis + nil-store service tests |
| `internal/handlers/leaderboard.go` | create | Connect handler: proto mapping, delegates to service |
| `internal/handlers/leaderboard_test.go` | create | Handler tests: FailedPrecondition, happy path via fake store |
| `go.mod` / `go.sum` | edit | Add `go-redis/v9`, `miniredis/v2` |
| `cmd/parley/main.go` or future `internal/connect/router.go` | edit (when present) | Mount `NewLeaderboardServiceHandler` with injected service |

Do **not** add Diesel/SQL/Bun queries for leaderboard reads.

---

## Domain contract (parity with Rust)

### Redis key

```
lb:{game}:{scope}:{kind}
```

- `game`: `r6` via `internal/stats/backends.Game.String()` (`GameR6` → `"r6"`).
- `scope`: `global` if `guild_id == ""`, else raw `guild_id`.
- `kind`: `elo` | `winrate` | `rp` (see `Kind` enum below).

### `Kind` (maps `LeaderboardType` proto)

| Proto | Go `Kind` | Redis suffix |
|-------|-----------|--------------|
| `LEADERBOARD_TYPE_ELO` (1) | `KindElo` | `elo` |
| `LEADERBOARD_TYPE_WIN_RATE` (2) | `KindWinRate` | `winrate` |
| `LEADERBOARD_TYPE_RANK_POINTS` (3) | `KindRankPoints` | `rp` |
| `UNSPECIFIED` (0) | default `KindElo` | `elo` |

### `Touch` scores (for stats cache integration later)

From `src/leaderboard.rs` `touch`:

- Elo ZSET: `rank_points` as `float64`
- Win rate ZSET: `ranked_stats.win_rate`
- RP ZSET: `rank_points` as `float64`

### Proto entry mapping (`proto_entry` in Rust)

Match `src/handlers/leaderboard.rs` lines 20–30:

- `player_id` = store entry `player_id`
- `username` = same string as `player_id` (not a DB lookup)
- `rank`, `score` from store
- `matches`, `wins`, `losses` = `0`; `win_rate` = `0.0`

### Request normalization

- `limit`: clamp to `[1, 500]` (Rust `req.limit.clamp(1, 500)`).
- `offset`: `max(0, req.offset)` as `int64` slice start for `ZREVRANGE`.
- `game`: `GAME_R6` and `GAME_BRAWL_STARS` both map to `backends.GameR6` until a Brawl backend exists (same as Rust handler today).

### Degraded mode

When `LeaderboardService` has `store == nil`:

- `GetLeaderboard` / `GetPlayerRank` return error: `connect.NewError(connect.CodeFailedPrecondition, errors.New("leaderboard not configured (set REDIS_URL)"))`
- Message string should match Rust operator hint for bridge/worker logs.

---

## Task 1: Dependencies

**Files:** `go.mod`, `go.sum`

- [ ] **Step 1: Add Redis + miniredis**

```bash
cd /Users/juwen/dev/commerce/parley && go get github.com/redis/go-redis/v9 github.com/alicebob/miniredis/v2
```

Expected: both modules appear in `go.mod` require block.

---

## Task 2: `Store` interface + Redis implementation

**Files:**

- Create: `internal/services/leaderboard.go`
- Create: `internal/services/leaderboard_test.go`

- [ ] **Step 1: Write failing tests for key format and ZSET ops**

```go
package services_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/parley-bot/parley/internal/services"
	"github.com/parley-bot/parley/internal/stats/backends"
	"github.com/parley-bot/parley/internal/stats/scrape"
	"github.com/redis/go-redis/v9"
)

func TestRedisStoreKeyGlobalElo(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()

	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	store := services.NewRedisStore(client)

	stats := scrape.ScrapedStats{
		RankedStats: scrape.RankedStats{RankPoints: 2500, WinRate: 55.5},
	}
	store.Touch(context.Background(), backends.GameR6, "", "player-1", &stats)

	got, err := store.PlayerRank(context.Background(), backends.GameR6, "", services.KindElo, "player-1")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("expected entry")
	}
	if got.Rank != 1 || got.Score != 2500 {
		t.Fatalf("got rank=%d score=%v", got.Rank, got.Score)
	}
}

func TestRedisStoreTopPagination(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	store := services.NewRedisStore(client)
	ctx := context.Background()

	for i, score := range []float64{100, 200, 300} {
		id := fmt.Sprintf("p%c", 'a'+i)
		s := scrape.ScrapedStats{RankedStats: scrape.RankedStats{RankPoints: int32(score), WinRate: score}}
		store.Touch(ctx, backends.GameR6, "guild1", id, &s)
	}

	top, err := store.Top(ctx, backends.GameR6, "guild1", services.KindElo, 2, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(top) != 2 || top[0].Rank != 2 || top[0].PlayerID != "pb" {
		t.Fatalf("unexpected top: %+v", top)
	}
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
go test ./internal/services/... -run RedisStore -v
```

Expected: compile error (`NewRedisStore` undefined).

- [ ] **Step 3: Implement `internal/services/leaderboard.go`**

```go
package services

import (
	"context"
	"fmt"

	"github.com/parley-bot/parley/internal/stats/backends"
	"github.com/parley-bot/parley/internal/stats/scrape"
	"github.com/redis/go-redis/v9"
)

const leaderboardKeyPrefix = "lb"

type Kind int

const (
	KindElo Kind = iota
	KindWinRate
	KindRankPoints
)

func (k Kind) String() string {
	switch k {
	case KindWinRate:
		return "winrate"
	case KindRankPoints:
		return "rp"
	default:
		return "elo"
	}
}

// Entry is one row in a leaderboard slice.
type Entry struct {
	PlayerID string
	Rank     int64
	Score    float64
}

// Store is the leaderboard persistence port (Redis ZSET or test double).
type Store interface {
	Touch(ctx context.Context, game backends.Game, guildID, playerID string, stats *scrape.ScrapedStats) error
	Top(ctx context.Context, game backends.Game, guildID string, kind Kind, limit, offset int64) ([]Entry, error)
	PlayerRank(ctx context.Context, game backends.Game, guildID string, kind Kind, playerID string) (*Entry, error)
	Count(ctx context.Context, game backends.Game, guildID string, kind Kind) (int64, error)
	Remove(ctx context.Context, game backends.Game, guildID, playerID string) error
}

type RedisStore struct {
	client redis.Cmdable
}

func NewRedisStore(client redis.Cmdable) *RedisStore {
	return &RedisStore{client: client}
}

func leaderboardKey(game backends.Game, guildID string, kind Kind) string {
	scope := guildID
	if scope == "" {
		scope = "global"
	}
	return fmt.Sprintf("%s:%s:%s:%s", leaderboardKeyPrefix, game.String(), scope, kind.String())
}

func (s *RedisStore) Touch(ctx context.Context, game backends.Game, guildID, playerID string, stats *scrape.ScrapedStats) error {
	if stats == nil {
		return nil
	}
	rp := float64(stats.RankedStats.RankPoints)
	wr := stats.RankedStats.WinRate
	pipe := s.client.Pipeline()
	pipe.ZAdd(ctx, leaderboardKey(game, guildID, KindElo), redis.Z{Score: rp, Member: playerID})
	pipe.ZAdd(ctx, leaderboardKey(game, guildID, KindWinRate), redis.Z{Score: wr, Member: playerID})
	pipe.ZAdd(ctx, leaderboardKey(game, guildID, KindRankPoints), redis.Z{Score: rp, Member: playerID})
	_, err := pipe.Exec(ctx)
	return err
}

func (s *RedisStore) Top(ctx context.Context, game backends.Game, guildID string, kind Kind, limit, offset int64) ([]Entry, error) {
	key := leaderboardKey(game, guildID, kind)
	stop := offset + limit - 1
	vals, err := s.client.ZRevRangeWithScores(ctx, key, offset, stop).Result()
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(vals))
	for i, z := range vals {
		member, _ := z.Member.(string)
		out = append(out, Entry{
			PlayerID: member,
			Rank:     offset + int64(i) + 1,
			Score:    z.Score,
		})
	}
	return out, nil
}

func (s *RedisStore) PlayerRank(ctx context.Context, game backends.Game, guildID string, kind Kind, playerID string) (*Entry, error) {
	key := leaderboardKey(game, guildID, kind)
	rank, err := s.client.ZRevRank(ctx, key, playerID).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	score, err := s.client.ZScore(ctx, key, playerID).Result()
	if err != nil {
		return nil, err
	}
	return &Entry{PlayerID: playerID, Rank: rank + 1, Score: score}, nil
}

func (s *RedisStore) Count(ctx context.Context, game backends.Game, guildID string, kind Kind) (int64, error) {
	return s.client.ZCard(ctx, leaderboardKey(game, guildID, kind)).Result()
}

func (s *RedisStore) Remove(ctx context.Context, game backends.Game, guildID, playerID string) error {
	pipe := s.client.Pipeline()
	for _, kind := range []Kind{KindElo, KindWinRate, KindRankPoints} {
		pipe.ZRem(ctx, leaderboardKey(game, guildID, kind), playerID)
	}
	_, err := pipe.Exec(ctx)
	return err
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/services/... -run RedisStore -v
```

---

## Task 3: `LeaderboardService` + nil store guard

**Files:**

- Modify: `internal/services/leaderboard.go`
- Modify: `internal/services/leaderboard_test.go`

- [ ] **Step 1: Write failing test for nil store**

```go
func TestLeaderboardServiceNilStoreFailedPrecondition(t *testing.T) {
	svc := services.NewLeaderboardService(nil)
	_, err := svc.GetLeaderboard(context.Background(), services.GetLeaderboardParams{
		Game: backends.GameR6, GuildID: "", Kind: services.KindElo, Limit: 10, Offset: 0,
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if !services.IsNotConfigured(err) {
		t.Fatalf("want not configured, got %v", err)
	}
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
go test ./internal/services/... -run NilStore -v
```

- [ ] **Step 3: Add service types and methods**

```go
var ErrLeaderboardNotConfigured = errors.New("leaderboard not configured (set REDIS_URL)")

func IsNotConfigured(err error) bool {
	return errors.Is(err, ErrLeaderboardNotConfigured)
}

type LeaderboardService struct {
	store Store
}

func NewLeaderboardService(store Store) *LeaderboardService {
	return &LeaderboardService{store: store}
}

type GetLeaderboardParams struct {
	Game    backends.Game
	GuildID string
	Kind    Kind
	Limit   int32
	Offset  int32
}

type GetLeaderboardResult struct {
	Entries    []Entry
	TotalCount int64
}

func (s *LeaderboardService) requireStore() error {
	if s.store == nil {
		return ErrLeaderboardNotConfigured
	}
	return nil
}

func clampLimit(limit int32) int64 {
	if limit < 1 {
		return 1
	}
	if limit > 500 {
		return 500
	}
	return int64(limit)
}

func clampOffset(offset int32) int64 {
	if offset < 0 {
		return 0
	}
	return int64(offset)
}

func (s *LeaderboardService) GetLeaderboard(ctx context.Context, p GetLeaderboardParams) (GetLeaderboardResult, error) {
	if err := s.requireStore(); err != nil {
		return GetLeaderboardResult{}, err
	}
	limit := clampLimit(p.Limit)
	offset := clampOffset(p.Offset)
	entries, err := s.store.Top(ctx, p.Game, p.GuildID, p.Kind, limit, offset)
	if err != nil {
		return GetLeaderboardResult{}, err
	}
	total, err := s.store.Count(ctx, p.Game, p.GuildID, p.Kind)
	if err != nil {
		return GetLeaderboardResult{}, err
	}
	return GetLeaderboardResult{Entries: entries, TotalCount: total}, nil
}

type GetPlayerRankParams struct {
	Game     backends.Game
	GuildID  string
	PlayerID string
	Kind     Kind
}

func (s *LeaderboardService) GetPlayerRank(ctx context.Context, p GetPlayerRankParams) (*Entry, error) {
	if err := s.requireStore(); err != nil {
		return nil, err
	}
	return s.store.PlayerRank(ctx, p.Game, p.GuildID, p.Kind, p.PlayerID)
}
```

- [ ] **Step 4: Run service package tests**

```bash
go test ./internal/services/... -v
```

Expected: all PASS.

---

## Task 4: Connect handlers

**Files:**

- Create: `internal/handlers/leaderboard.go`
- Create: `internal/handlers/leaderboard_test.go`

- [ ] **Step 1: Write failing handler test (nil service store)**

```go
package handlers_test

import (
	"context"
	"errors"
	"testing"

	"connectrpc.com/connect"
	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	leaderboardv1 "github.com/parley-bot/parley/gen/parley/leaderboard/v1"
	"github.com/parley-bot/parley/internal/handlers"
	"github.com/parley-bot/parley/internal/services"
)

func TestGetLeaderboard_NotConfigured(t *testing.T) {
	h := handlers.NewLeaderboardHandler(services.NewLeaderboardService(nil))
	req := connect.NewRequest(&leaderboardv1.GetLeaderboardRequest{
		Game: commonv1.Game_GAME_R6,
		Type: leaderboardv1.LeaderboardType_LEADERBOARD_TYPE_ELO,
		Limit: 10,
	})
	_, err := h.GetLeaderboard(context.Background(), req)
	if err == nil {
		t.Fatal("expected error")
	}
	var ce *connect.Error
	if !errors.As(err, &ce) || ce.Code() != connect.CodeFailedPrecondition {
		t.Fatalf("got %v", err)
	}
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
go test ./internal/handlers/... -run NotConfigured -v
```

- [ ] **Step 3: Implement `internal/handlers/leaderboard.go`**

```go
package handlers

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	leaderboardv1 "github.com/parley-bot/parley/gen/parley/leaderboard/v1"
	"github.com/parley-bot/parley/internal/services"
	"github.com/parley-bot/parley/internal/stats/backends"
)

type LeaderboardHandler struct {
	svc *services.LeaderboardService
}

func NewLeaderboardHandler(svc *services.LeaderboardService) *LeaderboardHandler {
	return &LeaderboardHandler{svc: svc}
}

func mapLeaderboardType(t leaderboardv1.LeaderboardType) services.Kind {
	switch t {
	case leaderboardv1.LeaderboardType_LEADERBOARD_TYPE_WIN_RATE:
		return services.KindWinRate
	case leaderboardv1.LeaderboardType_LEADERBOARD_TYPE_RANK_POINTS:
		return services.KindRankPoints
	case leaderboardv1.LeaderboardType_LEADERBOARD_TYPE_ELO:
		return services.KindElo
	default:
		return services.KindElo
	}
}

func mapProtoGame(g commonv1.Game) backends.Game {
	switch g {
	case commonv1.Game_GAME_R6, commonv1.Game_GAME_BRAWL_STARS:
		return backends.GameR6
	default:
		return backends.GameR6
	}
}

func protoEntry(e services.Entry) *leaderboardv1.LeaderboardEntry {
	return &leaderboardv1.LeaderboardEntry{
		PlayerId: e.PlayerID,
		Username: e.PlayerID,
		Rank:     e.Rank,
		Score:    e.Score,
		Matches:  0,
		Wins:     0,
		Losses:   0,
		WinRate:  0,
	}
}

func (h *LeaderboardHandler) GetLeaderboard(ctx context.Context, req *connect.Request[leaderboardv1.GetLeaderboardRequest]) (*connect.Response[leaderboardv1.GetLeaderboardResponse], error) {
	r := req.Msg
	result, err := h.svc.GetLeaderboard(ctx, services.GetLeaderboardParams{
		Game:    mapProtoGame(r.GetGame()),
		GuildID: r.GetGuildId(),
		Kind:    mapLeaderboardType(r.GetType()),
		Limit:   r.GetLimit(),
		Offset:  r.GetOffset(),
	})
	if err != nil {
		if services.IsNotConfigured(err) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	entries := make([]*leaderboardv1.LeaderboardEntry, 0, len(result.Entries))
	for _, e := range result.Entries {
		entries = append(entries, protoEntry(e))
	}
	return connect.NewResponse(&leaderboardv1.GetLeaderboardResponse{
		Entries:    entries,
		TotalCount: result.TotalCount,
	}), nil
}

func (h *LeaderboardHandler) GetPlayerRank(ctx context.Context, req *connect.Request[leaderboardv1.GetPlayerRankRequest]) (*connect.Response[leaderboardv1.GetPlayerRankResponse], error) {
	r := req.Msg
	entry, err := h.svc.GetPlayerRank(ctx, services.GetPlayerRankParams{
		Game:     mapProtoGame(r.GetGame()),
		GuildID:  r.GetGuildId(),
		PlayerID: r.GetPlayerId(),
		Kind:     mapLeaderboardType(r.GetType()),
	})
	if err != nil {
		if services.IsNotConfigured(err) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	var proto *leaderboardv1.LeaderboardEntry
	if entry != nil {
		proto = protoEntry(*entry)
	}
	return connect.NewResponse(&leaderboardv1.GetPlayerRankResponse{Entry: proto}), nil
}

var _ interface {
	GetLeaderboard(context.Context, *connect.Request[leaderboardv1.GetLeaderboardRequest]) (*connect.Response[leaderboardv1.GetLeaderboardResponse], error)
	GetPlayerRank(context.Context, *connect.Request[leaderboardv1.GetPlayerRankRequest]) (*connect.Response[leaderboardv1.GetPlayerRankResponse], error)
} = (*LeaderboardHandler)(nil)
```

(Optional: replace the anonymous interface assert with `var _ leaderboardv1connect.LeaderboardServiceHandler = (*LeaderboardHandler)(nil)` and import `leaderboardv1connect`.)

- [ ] **Step 4: Add happy-path handler test with fake `Store`**

Implement a `fakeStore` in `leaderboard_test.go` (in-memory `map[string]float64` per key) or reuse miniredis + `NewRedisStore` wired through `NewLeaderboardService`.

- [ ] **Step 5: Run handler tests**

```bash
go test ./internal/handlers/... -v
```

Expected: PASS.

---

## Task 5: Wiring sketch (binary / router)

**Files:** `cmd/parley/main.go` (or future `internal/app/context.go` when the Go engine bootstrap lands)

- [ ] **Step 1: Construct store from `internal/config.Config.RedisURL`**

```go
var lbStore services.Store
if cfg.RedisURL != "" {
    opt, err := redis.ParseURL(cfg.RedisURL)
    if err != nil { /* log + exit or degrade */ }
    client := redis.NewClient(opt)
    if err := client.Ping(ctx).Err(); err != nil { /* handle */ }
    lbStore = services.NewRedisStore(client)
}
lbSvc := services.NewLeaderboardService(lbStore)
lbHandler := handlers.NewLeaderboardHandler(lbSvc)
path, mount := leaderboardv1connect.NewLeaderboardServiceHandler(lbHandler)
mux.Handle(path, mount) // or chi/httpx pattern used elsewhere
```

- [ ] **Step 2: Document in notepad** which router file was updated when this lands (may be a later task if `cmd/parley/main.go` is still empty).

---

## Task 6: Quality gates

- [ ] **Step 1: Format**

```bash
gofmt -w internal/services/leaderboard.go internal/services/leaderboard_test.go internal/handlers/leaderboard.go internal/handlers/leaderboard_test.go
```

- [ ] **Step 2: Full Go tests for touched packages**

```bash
go test ./internal/services/... ./internal/handlers/... -count=1
```

Expected: 0 failures.

- [ ] **Step 3: Append notepad line** (see below).

---

## Self-review (spec coverage)

| Requirement | Task |
|-------------|------|
| `LeaderboardStore` interface porting Rust ZSET ops | Task 2 |
| Redis + in-memory/miniredis tests | Tasks 2–4 |
| `GetLeaderboard`, `GetPlayerRank` RPCs | Task 4 |
| Thin handlers | Task 4 |
| `FailedPrecondition` when store nil | Tasks 3–4 |
| No Postgres reads | File map + service design |
| No global mutable leaderboard | Constructor injection in Tasks 3–5 |
| Append notepad | Task 6 |

**Note:** Rust returns HTTP 503 + JSON `"unavailable"` for nil leaderboard; Go Connect path uses `CodeFailedPrecondition` per Task 19 spec. Bridge/worker clients must already handle Connect errors; document any client-visible difference in the notepad if QA finds regressions.

---

## Implementation notepad

_(Implementer: append one line per completed task below.)_

- Plan written 2026-06-15 — Task 19 scope locked to `internal/services/leaderboard.go` + `internal/handlers/leaderboard.go`.