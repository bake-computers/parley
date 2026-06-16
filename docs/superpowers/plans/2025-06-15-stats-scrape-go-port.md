# Stats Scrape Go Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Rust HTML/Nuxt payload scraper (`src/scrape.rs`, `src/nuxt.rs`, `src/stats_metrics.rs`) to Go at `internal/stats/scrape/`, using `github.com/goccy/go-json` for Nuxt payload parsing.

**Architecture:** Three Go files mirror the three Rust modules: `nuxt.go` (lazy resolver over `__NUXT_DATA__` index references), `metrics.go` (KOST% calculation), `scrape.go` (HTML extraction + stats struct assembly). The Rust zero-copy `simd_json::BorrowedValue` approach becomes `go-json` unmarshaling into `[]any` with a resolver that follows integer index pointers through the flat array.

**Tech Stack:** Go 1.25, `github.com/goccy/go-json`, stdlib `testing`

---

## File Structure

```
internal/stats/scrape/
├── nuxt.go          # NuxtResolver — follows integer index references in __NUXT_DATA__ payloads
├── nuxt_test.go     # 12 tests: indirection, cycles, wrappers, dedup table edge cases, smoke test
├── metrics.go       # KOST% calculation (lower/upper/midpoint bounds) + round_to helper
├── metrics_test.go  # 3 tests: zero rounds, midpoint, upper clamp
├── scrape.go        # HTML extraction, type definitions, season catalog, ranked stats assembly
└── scrape_test.go   # 4 tests: nuxt extraction, empty HTML, season selector canonicalization, full scrape
```

---

### Task 1: Add `go-json` dependency

**Files:**
- Modify: `go.mod`, `go.sum`

- [ ] **Step 1: Add the dependency**

Run:
```bash
cd /Users/juwen/dev/commerce/parley && go get github.com/goccy/go-json
```

Expected: `go.mod` updated with `github.com/goccy/go-json` in require block.

---

### Task 2: Create `internal/stats/scrape/metrics.go`

Port of `src/stats_metrics.rs` (105 lines). Depends on `RankedStats` type defined in Task 4, but we can define it here as a forward reference or create the struct in this file first. Since `metrics.go` depends on `RankedStats` from `scrape.go`, we define `RankedStats` in `scrape.go` and import it within the same package.

**Files:**
- Create: `internal/stats/scrape/metrics.go`

- [ ] **Step 1: Write the metrics implementation**

```go
package scrape

import "math"

// RoundTo rounds the given float64 to n decimal places, matching
// TypeScript's Number(x.toFixed(n)) behavior.
func RoundTo(value float64, decimals int) float64 {
	factor := math.Pow(10, float64(decimals))
	return math.Round(value*factor) / factor
}

// CalculateKost estimates KOST% (midpoint between lower and upper bounds).
// Ported from the TypeScript calculateKost helper.
//
//	lower = max(killRounds, survivalRounds, tradedRounds)
//	upper = min(roundsPlayed, killRounds + survivalRounds + tradedRounds)
//	estimate = (lower + upper) / 2
//	KOST% = estimate / roundsPlayed * 100
func CalculateKost(stats *RankedStats) float64 {
	roundsPlayed := float64(stats.RoundsPlayed)
	if roundsPlayed <= 0 {
		return 0
	}

	killRounds := float64(stats.KillRounds)
	survivalRounds := float64(stats.SurvivalRounds)
	tradedRounds := float64(stats.TradedRounds)

	lower := math.Max(killRounds, math.Max(survivalRounds, tradedRounds))
	upper := math.Min(roundsPlayed, killRounds+survivalRounds+tradedRounds)
	estimate := (lower + upper) / 2.0

	return RoundTo((estimate/roundsPlayed)*100, 2)
}

// KostLowerBound returns the pessimistic KOST% estimate.
func KostLowerBound(stats *RankedStats) float64 {
	roundsPlayed := float64(stats.RoundsPlayed)
	if roundsPlayed <= 0 {
		return 0
	}
	lower := math.Max(float64(stats.KillRounds), math.Max(float64(stats.SurvivalRounds), float64(stats.TradedRounds)))
	return RoundTo((lower/roundsPlayed)*100, 2)
}

// KostUpperBound returns the optimistic KOST% estimate, clamped by total rounds.
func KostUpperBound(stats *RankedStats) float64 {
	roundsPlayed := float64(stats.RoundsPlayed)
	if roundsPlayed <= 0 {
		return 0
	}
	upper := math.Min(roundsPlayed, float64(stats.KillRounds)+float64(stats.SurvivalRounds)+float64(stats.TradedRounds))
	return RoundTo((upper/roundsPlayed)*100, 2)
}
```

- [ ] **Step 2: Verify it compiles (will fail until RankedStats exists)**

Skip — this file depends on `RankedStats` from Task 4. Implement Task 4 first, then compile together.

---

### Task 3: Create `internal/stats/scrape/metrics_test.go`

Port of the inline `#[cfg(test)] mod tests` in `stats_metrics.rs`.

**Files:**
- Create: `internal/stats/scrape/metrics_test.go`

- [ ] **Step 1: Write the metrics tests**

```go
package scrape

import "testing"

func sampleRankedStats() *RankedStats {
	return &RankedStats{
		RoundsPlayed:   100,
		KillRounds:     40,
		SurvivalRounds: 30,
		TradedRounds:   10,
	}
}

func TestZeroRoundsReturnsZero(t *testing.T) {
	stats := &RankedStats{}
	if CalculateKost(stats) != 0 {
		t.Errorf("CalculateKost zero rounds: got %v, want 0", CalculateKost(stats))
	}
	if KostLowerBound(stats) != 0 {
		t.Errorf("KostLowerBound zero rounds: got %v, want 0", KostLowerBound(stats))
	}
	if KostUpperBound(stats) != 0 {
		t.Errorf("KostUpperBound zero rounds: got %v, want 0", KostUpperBound(stats))
	}
}

func TestKostMidpointMatchesTS(t *testing.T) {
	s := sampleRankedStats()
	// lower = max(40, 30, 10) = 40 => 40%
	// upper = min(100, 80) = 80 => 80%
	// midpoint = 60%
	if got := KostLowerBound(s); got != 40.0 {
		t.Errorf("KostLowerBound: got %v, want 40.0", got)
	}
	if got := KostUpperBound(s); got != 80.0 {
		t.Errorf("KostUpperBound: got %v, want 80.0", got)
	}
	if got := CalculateKost(s); got != 60.0 {
		t.Errorf("CalculateKost: got %v, want 60.0", got)
	}
}

func TestUpperIsClampedByTotalRounds(t *testing.T) {
	s := &RankedStats{
		RoundsPlayed:   10,
		KillRounds:     8,
		SurvivalRounds: 8,
		TradedRounds:   8,
	}
	// sum = 24, rounds = 10 => upper = 100%
	if got := KostUpperBound(s); got != 100.0 {
		t.Errorf("KostUpperBound: got %v, want 100.0", got)
	}
}
```

---

### Task 4: Create `internal/stats/scrape/nuxt.go`

Port of `src/nuxt.rs` (382 lines). This is the core resolver that follows integer index references in the Nuxt `__NUXT_DATA__` flat array.

Key differences from Rust:
- No zero-copy borrowing — `go-json` unmarshals into `any` (which is `map[string]any`, `[]any`, `float64`, `string`, `bool`, `nil`)
- `NuxtResolver` wraps `[]any` and resolves `any` values by following integer references
- Integer detection: JSON numbers become `float64` in Go, so we check if a float64 is a whole number and treat it as an index

**Files:**
- Create: `internal/stats/scrape/nuxt.go`

- [ ] **Step 1: Write the nuxt resolver implementation**

```go
package scrape

// nuxt.go — Lazy resolver over the __NUXT_DATA__ payload.
//
// Nuxt serialises reactive state as a flat JSON array where nested values are
// referenced by index: a number 42 inside the payload means "look at
// payload[42]". Wrapper tuples like ["Reactive", 42] mean the same thing.

// nuxtWrapperTags are tags that wrap an index reference inside the Nuxt payload.
// e.g. ["Reactive", 42] means "resolve index 42".
var nuxtWrapperTags = map[string]bool{
	"Reactive":        true,
	"ShallowReactive": true,
	"Ref":             true,
	"EmptyRef":        true,
	"Set":             true,
	"Map":             true,
}

// maxHops is the safety cap on pointer-chase depth. Real payloads use at most
// 2-3 hops per field; 64 leaves plenty of headroom while bounding worst-case cycles.
const maxHops = 64

// NuxtResolver resolves index references in a Nuxt __NUXT_DATA__ flat array.
type NuxtResolver struct {
	payload []any
}

// NewNuxtResolver creates a resolver over the top-level payload array.
func NewNuxtResolver(payload []any) *NuxtResolver {
	return &NuxtResolver{payload: payload}
}

// Payload returns the backing payload slice.
func (r *NuxtResolver) Payload() []any {
	return r.payload
}

// asInt attempts to interpret an any value as an integer index.
// Returns (index, true) if the value is a whole number float64 within bounds.
func (r *NuxtResolver) asInt(v any) (int, bool) {
	f, ok := v.(float64)
	if !ok {
		return 0, false
	}
	i := int(f)
	if float64(i) != f {
		return 0, false
	}
	return i, true
}

// isNegative checks if a value is a negative integer (sentinel like -1).
func isNegative(v any) bool {
	f, ok := v.(float64)
	return ok && f < 0 && float64(int(f)) == f
}

// Resolve follows pointers/wrappers until we land on a concrete value.
//
// Returns the input unchanged for anything that isn't an index pointer or a
// wrapper tuple. Negative values stay unresolved so callers can distinguish
// -1 sentinels.
//
// Integer dereference semantics: after one integer dereference, the result IS
// the actual value — not another index reference. Following small integers
// further would read unrelated entries from the dedup table.
func (r *NuxtResolver) Resolve(val any) any {
	plainIntConsumed := false
	for range maxHops {
		// Scalar index reference: a plain integer means "resolve payload[i]".
		if idx, ok := r.asInt(val); ok {
			if idx < 0 {
				return val
			}
			if idx >= len(r.payload) {
				return val
			}
			// After one integer dereference, a plain integer IS the actual value.
			if plainIntConsumed {
				return val
			}
			plainIntConsumed = true
			val = r.payload[idx]
			continue
		}

		// Wrapper tuple: ["Reactive", 42] and friends.
		if arr, ok := val.([]any); ok && len(arr) == 2 {
			if tag, ok := arr[0].(string); ok && nuxtWrapperTags[tag] {
				val = arr[1]
				plainIntConsumed = false
				continue
			}
		}

		return val
	}
	return val
}

// ResolveIndex resolves the entry at payload[i]. Returns nil if out of bounds.
func (r *NuxtResolver) ResolveIndex(i int) any {
	if i < 0 || i >= len(r.payload) {
		return nil
	}
	return r.Resolve(r.payload[i])
}

// Field performs object field access that auto-follows pointers on both the
// container (in case value is itself a pointer) and the returned field.
func (r *NuxtResolver) Field(value any, key string) any {
	resolved := r.Resolve(value)
	obj, ok := resolved.(map[string]any)
	if !ok {
		return nil
	}
	raw, ok := obj[key]
	if !ok {
		return nil
	}
	return r.Resolve(raw)
}

// IsNullSentinel checks for Nuxt's {"__i": ...} null sentinel.
func IsNullSentinel(value any) bool {
	obj, ok := value.(map[string]any)
	if !ok {
		return false
	}
	_, has := obj["__i"]
	return len(obj) == 1 && has
}

// IsObject checks if the value is a map[string]any.
func IsObject(v any) bool {
	_, ok := v.(map[string]any)
	return ok
}

// AsObject returns the value as map[string]any, or nil.
func AsObject(v any) map[string]any {
	obj, _ := v.(map[string]any)
	return obj
}

// AsArray returns the value as []any, or nil.
func AsArray(v any) []any {
	arr, _ := v.([]any)
	return arr
}

// AsStr returns the value as a string, or empty string.
func AsStr(v any) string {
	s, _ := v.(string)
	return s
}

// AsFloat returns the value as float64, or 0.
func AsFloat(v any) float64 {
	f, _ := v.(float64)
	return f
}

// AsBool returns the value as bool, or false.
func AsBool(v any) bool {
	b, _ := v.(bool)
	return b
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd /Users/juwen/dev/commerce/parley && go build ./internal/stats/scrape/
```

Expected: clean compile (note: depends on `RankedStats` from Task 5).

---

### Task 5: Create `internal/stats/scrape/nuxt_test.go`

Port of the 12 inline tests in `src/nuxt.rs`.

**Files:**
- Create: `internal/stats/scrape/nuxt_test.go`

- [ ] **Step 1: Write the nuxt resolver tests**

```go
package scrape

import (
	"testing"

	gojson "github.com/goccy/go-json"
)

func parsePayload(t *testing.T, jsonStr string) []any {
	t.Helper()
	var payload []any
	if err := gojson.Unmarshal([]byte(jsonStr), &payload); err != nil {
		t.Fatalf("failed to parse payload: %v", err)
	}
	return payload
}

func TestResolvesScalarIndirection(t *testing.T) {
	payload := parsePayload(t, `[1, "hello"]`)
	r := NewNuxtResolver(payload)
	if got := AsStr(r.Resolve(payload[0])); got != "hello" {
		t.Errorf("Resolve: got %q, want %q", got, "hello")
	}
}

func TestTreatsNegativeOneAsUnresolved(t *testing.T) {
	payload := parsePayload(t, `[-1]`)
	r := NewNuxtResolver(payload)
	result := r.Resolve(payload[0])
	if f, ok := result.(float64); !ok || f != -1 {
		t.Errorf("Resolve(-1): got %v, want -1", result)
	}
}

func TestUnwrapsReactiveWrapper(t *testing.T) {
	payload := parsePayload(t, `[1, "value", ["Reactive", 1]]`)
	r := NewNuxtResolver(payload)
	if got := AsStr(r.Resolve(payload[2])); got != "value" {
		t.Errorf("Resolve wrapper: got %q, want %q", got, "value")
	}
}

func TestFieldFollowsPointers(t *testing.T) {
	payload := parsePayload(t, `[{"name": 1}, "deep value"]`)
	r := NewNuxtResolver(payload)
	v := r.Field(payload[0], "name")
	if got := AsStr(v); got != "deep value" {
		t.Errorf("Field: got %q, want %q", got, "deep value")
	}
}

func TestDetectsNullSentinel(t *testing.T) {
	payload := parsePayload(t, `[{"__i": 5}]`)
	if !IsNullSentinel(payload[0]) {
		t.Error("expected null sentinel detection")
	}
}

func TestSelfCycleDoesNotSpinForever(t *testing.T) {
	payload := parsePayload(t, `[1, 0]`)
	r := NewNuxtResolver(payload)
	result := r.Resolve(payload[0])
	if f, ok := result.(float64); !ok || f != 0 {
		t.Errorf("cycle resolve: got %v, want 0", result)
	}
}

func TestStopsAfterOneIntegerDereference(t *testing.T) {
	payload := parsePayload(t, `[1, 42]`)
	r := NewNuxtResolver(payload)
	result := r.Resolve(payload[0])
	if f, ok := result.(float64); !ok || f != 42 {
		t.Errorf("one dereference: got %v, want 42", result)
	}
}

func TestDoesNotChaseSmallIntegerToUnrelatedValue(t *testing.T) {
	payload := parsePayload(t, `[{"wins": 2}, "unrelated", 3, "quick-match"]`)
	r := NewNuxtResolver(payload)
	wins := r.Field(payload[0], "wins")
	if f, ok := wins.(float64); !ok || f != 3 {
		t.Errorf("wins: got %v, want 3", wins)
	}
}

func TestDoesNotChaseIntegerToArray(t *testing.T) {
	payload := parsePayload(t, `[{"matches": 1}, 15, ["battleye", "cheating"]]`)
	r := NewNuxtResolver(payload)
	matches := r.Field(payload[0], "matches")
	if f, ok := matches.(float64); !ok || f != 15 {
		t.Errorf("matches: got %v, want 15", matches)
	}
}

func TestDoesNotChaseZeroToFirstElement(t *testing.T) {
	payload := parsePayload(t, `[["ShallowReactive", 2], 0, {"abandons": 1}]`)
	r := NewNuxtResolver(payload)
	obj := r.Resolve(payload[2])
	abandons := r.Field(obj, "abandons")
	if f, ok := abandons.(float64); !ok || f != 0 {
		t.Errorf("abandons: got %v, want 0", abandons)
	}
}

func TestFollowsStringThroughOneHop(t *testing.T) {
	payload := parsePayload(t, `[{"rank": 1}, "bronze-ii"]`)
	r := NewNuxtResolver(payload)
	rank := r.Field(payload[0], "rank")
	if got := AsStr(rank); got != "bronze-ii" {
		t.Errorf("rank: got %q, want %q", got, "bronze-ii")
	}
}

func TestWrapperAllowsFreshDereference(t *testing.T) {
	payload := parsePayload(t, `[["Reactive", 2], {"level": 3}, 200]`)
	r := NewNuxtResolver(payload)
	result := r.Resolve(payload[0])
	if f, ok := result.(float64); !ok || f != 200 {
		t.Errorf("wrapper fresh deref: got %v, want 200", result)
	}
}

func TestOutOfBoundsIntegerIsReturnedAsIs(t *testing.T) {
	payload := parsePayload(t, `[{"peak": 1}, 2414]`)
	r := NewNuxtResolver(payload)
	peak := r.Field(payload[0], "peak")
	if f, ok := peak.(float64); !ok || f != 2414 {
		t.Errorf("peak: got %v, want 2414", peak)
	}
}

func TestRealStatsCCPayloadSmokeTest(t *testing.T) {
	payload := parsePayload(t, `[
		{"rank_tiers": {}, "ranks": {}, "seasons": {}},
		{"username": 4, "level": 5, "ranked_season_records": 6, "season_mode_records": 7},
		"silent-hunt",
		"bronze-ii",
		"Avqny",
		200,
		{"silent-hunt": {"rank": 3, "max_rank": 3, "rank_points": 19, "max_rank_points": 19}},
		{"silent-hunt": 8},
		{"matches": 10, "wins": 11, "losses": 12, "kills": 13, "deaths": 14, "kd": 15, "hs": 16, "wr": 14, "abandons": 17, "headshots": 13, "assists": 18, "rank": 3, "max_rank": 3, "rank_points": 19, "max_rank_points": 19},
		"Silent Hunt",
		15,
		9,
		6,
		94,
		60,
		1.5667,
		41.49,
		0,
		56,
		1883
	]`)
	r := NewNuxtResolver(payload)

	profile := r.Resolve(payload[1])
	if got := AsStr(r.Field(profile, "username")); got != "Avqny" {
		t.Errorf("username: got %q, want %q", got, "Avqny")
	}
	if got := AsFloat(r.Field(profile, "level")); got != 200 {
		t.Errorf("level: got %v, want 200", got)
	}

	seasonModes := r.Field(profile, "season_mode_records")
	rankedBomb := r.Field(seasonModes, "silent-hunt")
	if got := AsFloat(r.Field(rankedBomb, "matches")); got != 15 {
		t.Errorf("matches: got %v, want 15", got)
	}
	if got := AsFloat(r.Field(rankedBomb, "wins")); got != 9 {
		t.Errorf("wins: got %v, want 9", got)
	}
	if got := AsFloat(r.Field(rankedBomb, "losses")); got != 6 {
		t.Errorf("losses: got %v, want 6", got)
	}
	if got := AsFloat(r.Field(rankedBomb, "kills")); got != 94 {
		t.Errorf("kills: got %v, want 94", got)
	}
	if got := AsFloat(r.Field(rankedBomb, "deaths")); got != 60 {
		t.Errorf("deaths: got %v, want 60", got)
	}
	if got := AsFloat(r.Field(rankedBomb, "wr")); got != 60 {
		t.Errorf("wr: got %v, want 60", got)
	}
	if got := AsStr(r.Field(rankedBomb, "rank")); got != "bronze-ii" {
		t.Errorf("rank: got %q, want %q", got, "bronze-ii")
	}
	if got := AsFloat(r.Field(rankedBomb, "abandons")); got != 0 {
		t.Errorf("abandons: got %v, want 0", got)
	}
	if got := AsFloat(r.Field(rankedBomb, "rank_points")); got != 1883 {
		t.Errorf("rank_points: got %v, want 1883", got)
	}
}
```

---

### Task 6: Create `internal/stats/scrape/scrape.go`

Port of `src/scrape.rs` (992 lines). This is the largest file — it defines all the public types and the HTML extraction + stats assembly logic.

**Files:**
- Create: `internal/stats/scrape/scrape.go`

- [ ] **Step 1: Write the type definitions and extraction helpers**

```go
package scrape

// scrape.go — HTML + Nuxt payload parsing. Pure (no network I/O).
//
// Parses the __NUXT_DATA__ JSON from stats.cc HTML pages and extracts
// player profiles, ranked stats, season catalogs, and derived metrics.

import (
	"sort"
	"strings"

	gojson "github.com/goccy/go-json"
)

// StatsProfile holds a single player profile block.
type StatsProfile struct {
	Username   string `json:"username"`
	Level      int    `json:"level"`
	ProfileID  string `json:"profile_id"`
	Platform   string `json:"platform"`
	ProfileURL string `json:"profile_url"`
}

// RankedStats holds ranked or fallback-mode numeric stats.
// Matches proto.stats.v1.RankedStats.
type RankedStats struct {
	Season          string `json:"season"`
	SeasonSlug      string `json:"season_slug"`
	SeasonDisplay   string `json:"season_display"`
	SeasonStartedAt string `json:"season_started_at"`
	Mode            string `json:"mode"`

	Matches   int `json:"matches"`
	Wins      int `json:"wins"`
	Losses    int `json:"losses"`
	Abandons  int `json:"abandons"`

	Kills      int `json:"kills"`
	Deaths     int `json:"deaths"`
	Assists    int `json:"assists"`
	Headshots  int `json:"headshots"`

	KDRatio             float64 `json:"kd_ratio"`
	HeadshotPercentage  float64 `json:"headshot_percentage"`
	WinRate             float64 `json:"win_rate"`

	RankPoints     int `json:"rank_points"`
	PeakRankPoints int `json:"peak_rank_points"`

	CurrentRankSlug string `json:"current_rank_slug"`
	CurrentRank     string `json:"current_rank"`
	CurrentRankTier string `json:"current_rank_tier"`

	PeakRankSlug string `json:"peak_rank_slug"`
	PeakRank     string `json:"peak_rank"`
	PeakRankTier string `json:"peak_rank_tier"`

	AllTimePeakRankSlug    string `json:"all_time_peak_rank_slug"`
	AllTimePeakRank        string `json:"all_time_peak_rank"`
	AllTimePeakRankTier    string `json:"all_time_peak_rank_tier"`
	AllTimePeakRankPoints  int    `json:"all_time_peak_rank_points"`
	AllTimePeakRankSeason  string `json:"all_time_peak_rank_season"`

	RoundsPlayed      int `json:"rounds_played"`
	KillRounds        int `json:"kill_rounds"`
	SurvivalRounds    int `json:"survival_rounds"`
	TradedRounds      int `json:"traded_rounds"`
	OpeningKillRounds int `json:"opening_kill_rounds"`
	MatchesInCache    int `json:"matches_in_cache"`
}

// CalculatedMetrics holds KOST and other derived metrics.
type CalculatedMetrics struct {
	KOST            float64 `json:"kost"`
	KOSTLowerBound  float64 `json:"kost_lower_bound"`
	KOSTUpperBound  float64 `json:"kost_upper_bound"`
	KOSTDescription string  `json:"kost_description"`
}

// ScrapedStats combines profile, ranked stats, and calculated metrics.
type ScrapedStats struct {
	Profile          StatsProfile      `json:"profile"`
	RankedStats      RankedStats       `json:"ranked_stats"`
	CalculatedMetrics CalculatedMetrics `json:"calculated_metrics"`
}

// SeasonCatalogEntry describes a single season in the catalog.
type SeasonCatalogEntry struct {
	Slug      string `json:"slug"`
	Display   string `json:"display"`
	StartedAt string `json:"started_at"`
}

// ScrapedStatsCollection holds stats for all seasons plus the latest.
type ScrapedStatsCollection struct {
	Latest         ScrapedStats                  `json:"latest"`
	BySeason       map[string]ScrapedStats       `json:"by_season"`
	SeasonCatalog  []SeasonCatalogEntry          `json:"season_catalog"`
}

const kostDescription = "Estimated KOST% from aggregated match summaries (no round-level K/O/S/T flags in payload)"

// ExtractNuxtPayload pulls the __NUXT_DATA__ JSON string out of an HTML document.
func ExtractNuxtPayload(html string) (string, bool) {
	idPos := strings.Index(html, `id="__NUXT_DATA__"`)
	if idPos < 0 {
		idPos = strings.Index(html, `id='__NUXT_DATA__'`)
	}
	if idPos < 0 {
		return "", false
	}
	rest := html[idPos:]
	contentStart := strings.Index(rest, ">")
	if contentStart < 0 {
		return "", false
	}
	contentStart += idPos + 1
	contentEnd := strings.Index(html[contentStart:], "</script>")
	if contentEnd < 0 {
		return "", false
	}
	contentEnd += contentStart
	return strings.TrimSpace(html[contentStart:contentEnd]), true
}

// num extracts a float64 from an any value (handles float64, string-parse, bool).
func num(v any) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case string:
		var f float64
		// simple parse — ignore error, return 0
		_, _ = gojson.Unmarshal([]byte(val), &f)
		return f
	case bool:
		if val {
			return 1
		}
		return 0
	default:
		return 0
	}
}

// numInt extracts an int from an any value.
func numInt(v any) int {
	return int(num(v))
}

// strField extracts a string from an any value, returning empty string if nil.
func strField(v any) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}

// nonemptyStr extracts a non-empty string, returning "" if nil or empty.
func nonemptyStr(v any) string {
	s := strField(v)
	if s == "" {
		return ""
	}
	return s
}
```

- [ ] **Step 2: Add profile/constants discovery and season helpers**

Append to `scrape.go`:

```go
// findProfileAndConstantsIndices scans the payload for the profile and constants objects.
func findProfileAndConstantsIndices(payload []any) (profileIdx, constantsIdx int, ok bool) {
	pi, ci := -1, -1
	for i, item := range payload {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if pi < 0 {
			if _, hasUser := obj["username"]; hasUser {
				if _, hasRanked := obj["ranked_season_records"]; hasRanked {
					if _, hasModes := obj["season_mode_records"]; hasModes {
						pi = i
					}
				}
			}
		}
		if ci < 0 {
			if _, hasTiers := obj["rank_tiers"]; hasTiers {
				if _, hasRanks := obj["ranks"]; hasRanks {
					if _, hasSeasons := obj["seasons"]; hasSeasons {
						ci = i
					}
				}
			}
		}
		if pi >= 0 && ci >= 0 {
			break
		}
	}
	if pi < 0 || ci < 0 {
		return -1, -1, false
	}
	return pi, ci, true
}

func seasonDisplay(slug string, seasonsMeta any, resolver *NuxtResolver) string {
	meta := resolver.Field(seasonsMeta, slug)
	d := nonemptyStr(resolver.Field(meta, "display"))
	if d == "" {
		return slug
	}
	return d
}

func seasonStartedAt(slug string, seasonsMeta any, resolver *NuxtResolver) string {
	meta := resolver.Field(seasonsMeta, slug)
	return strField(resolver.Field(meta, "started_at"))
}

func sortSeasonSlugsByStartDesc(slugs []string, seasonsMeta any, resolver *NuxtResolver) {
	sort.Slice(slugs, func(i, j int) bool {
		ls := seasonStartedAt(slugs[i], seasonsMeta, resolver)
		rs := seasonStartedAt(slugs[j], seasonsMeta, resolver)
		if ls == rs {
			return slugs[j] < slugs[i]
		}
		return rs < ls
	})
}

func buildSeasonCatalog(rankedSeasons, seasonsMeta any, resolver *NuxtResolver) []SeasonCatalogEntry {
	resolved := resolver.Resolve(rankedSeasons)
	obj := AsObject(resolved)
	if obj == nil {
		return nil
	}
	slugs := make([]string, 0, len(obj))
	for k := range obj {
		slugs = append(slugs, k)
	}
	sortSeasonSlugsByStartDesc(slugs, seasonsMeta, resolver)
	catalog := make([]SeasonCatalogEntry, len(slugs))
	for i, slug := range slugs {
		catalog[i] = SeasonCatalogEntry{
			Slug:      slug,
			Display:   seasonDisplay(slug, seasonsMeta, resolver),
			StartedAt: seasonStartedAt(slug, seasonsMeta, resolver),
		}
	}
	return catalog
}

func rankLabel(rankSlug string, ranks, rankTiers any, resolver *NuxtResolver) (display, tier string) {
	if rankSlug == "" {
		return "Unknown", "Unknown"
	}
	rankEntry := resolver.Field(ranks, rankSlug)
	d := nonemptyStr(resolver.Field(rankEntry, "display"))
	if d == "" {
		d = rankSlug
	}
	tierSlug := nonemptyStr(resolver.Field(rankEntry, "tier"))
	if tierSlug == "" {
		return d, "Unknown"
	}
	t := nonemptyStr(resolver.Field(resolver.Field(rankTiers, tierSlug), "display"))
	if t == "" {
		t = tierSlug
	}
	return d, t
}
```

- [ ] **Step 3: Add match extraction and round summarization**

Append to `scrape.go`:

```go
func keyMatchesPlaylist(key, pl string) bool {
	const prefix = `"playlist":"`
	pos := strings.Index(key, prefix)
	if pos < 0 {
		return false
	}
	rest := key[pos+len(prefix):]
	return len(rest) > len(pl) && rest[:len(pl)] == pl && rest[len(pl)] == '"'
}

func extractMatchesByPlaylist(resolver *NuxtResolver, playlist string) []any {
	for _, item := range resolver.Payload() {
		obj := AsObject(item)
		if obj == nil {
			continue
		}
		for key, value := range obj {
			if !strings.Contains(key, `"matches"`) {
				continue
			}
			if playlist != "" && !keyMatchesPlaylist(key, playlist) {
				continue
			}
			resolvedQuery := resolver.Resolve(value)
			arr := AsArray(resolvedQuery)
			if len(arr) == 0 {
				continue
			}
			first := resolver.Resolve(arr[0])
			queryMap := AsObject(first)
			if queryMap == nil {
				continue
			}
			pagesRaw, ok := queryMap["pages"]
			if !ok {
				continue
			}
			pages := resolver.Resolve(pagesRaw)
			pagesArr := AsArray(pages)
			if len(pagesArr) == 0 {
				continue
			}
			firstPage := resolver.Resolve(pagesArr[0])
			firstPageArr := AsArray(firstPage)
			if len(firstPageArr) == 0 {
				continue
			}
			out := make([]any, 0, len(firstPageArr))
			for _, mRaw := range firstPageArr {
				m := resolver.Resolve(mRaw)
				if IsObject(m) {
					out = append(out, m)
				}
			}
			return out
		}
	}
	return nil
}

type matchRoundTotals struct {
	roundsPlayed      int
	survivalRounds    int
	tradedRounds      int
	openingKillRounds int
	killRounds        int
}

func summarizeMatchRounds(resolver *NuxtResolver, matches []any) matchRoundTotals {
	var t matchRoundTotals
	for _, m := range matches {
		s := resolver.Field(m, "player_summary")
		if s == nil {
			continue
		}
		rounds := numInt(resolver.Field(s, "rounds"))
		t.roundsPlayed += rounds
		t.survivalRounds += numInt(resolver.Field(s, "round_survivals"))
		t.tradedRounds += numInt(resolver.Field(s, "trades"))
		t.openingKillRounds += numInt(resolver.Field(s, "opening_kills"))
		kills := numInt(resolver.Field(s, "kills"))
		kills2k := numInt(resolver.Field(s, "kills_2k"))
		kills3k := numInt(resolver.Field(s, "kills_3k"))
		kills4k := numInt(resolver.Field(s, "kills_4k"))
		kills5k := numInt(resolver.Field(s, "kills_5k"))
		roundsWithKill := kills - kills2k - 2*kills3k - 3*kills4k - 4*kills5k
		if roundsWithKill < 0 {
			roundsWithKill = 0
		}
		if roundsWithKill > rounds {
			roundsWithKill = rounds
		}
		t.killRounds += roundsWithKill
	}
	return t
}
```

- [ ] **Step 4: Add profile building, ranked stats assembly, and fallback logic**

Append to `scrape.go`:

```go
func baseProfile(profile any, resolver *NuxtResolver) StatsProfile {
	username := nonemptyStr(resolver.Field(profile, "username"))
	if username == "" {
		username = "Unknown"
	}
	return StatsProfile{
		Username: username,
		Level:    numInt(resolver.Field(profile, "level")),
	}
}

func toScraped(profile StatsProfile, ranked RankedStats) ScrapedStats {
	return ScrapedStats{
		Profile: profile,
		CalculatedMetrics: CalculatedMetrics{
			KOST:            CalculateKost(&ranked),
			KOSTLowerBound:  KostLowerBound(&ranked),
			KOSTUpperBound:  KostUpperBound(&ranked),
			KOSTDescription: kostDescription,
		},
		RankedStats: ranked,
	}
}

func buildRankedForSeason(
	resolver *NuxtResolver,
	rankedSeasons, seasonModeRecords, seasonsMeta, ranks, rankTiers any,
	seasonSlug string,
) RankedStats {
	currentSeason := resolver.Field(rankedSeasons, seasonSlug)
	currentRankSlug := nonemptyStr(resolver.Field(currentSeason, "rank"))
	peakRankSlug := nonemptyStr(resolver.Field(currentSeason, "max_rank"))
	currentRank, currentRankTier := rankLabel(currentRankSlug, ranks, rankTiers, resolver)
	peakRank, peakRankTier := rankLabel(peakRankSlug, ranks, rankTiers, resolver)

	var allTimePeakSeason string
	var allTimePeakRecord any
	allTimePeakPoints := -1
	if seasonsObj := AsObject(resolver.Resolve(rankedSeasons)); seasonsObj != nil {
		for slug, recRaw := range seasonsObj {
			rec := resolver.Resolve(recRaw)
			pts := numInt(resolver.Field(rec, "max_rank_points"))
			if pts > allTimePeakPoints {
				allTimePeakPoints = pts
				allTimePeakSeason = slug
				allTimePeakRecord = rec
			}
		}
	}
	allTimePeakSlug := nonemptyStr(resolver.Field(allTimePeakRecord, "max_rank"))
	allTimePeakRank, allTimePeakRankTier := rankLabel(allTimePeakSlug, ranks, rankTiers, resolver)

	seasonModesOpt := resolver.Field(seasonModeRecords, seasonSlug)
	var modeRecord any
	if r := resolver.Field(seasonModesOpt, "ranked-bomb"); r != nil && IsObject(r) {
		modeRecord = r
	} else if smObj := AsObject(seasonModesOpt); smObj != nil {
		for ms, recRaw := range smObj {
			if strings.Contains(ms, "ranked") {
				r := resolver.Resolve(recRaw)
				if IsObject(r) {
					modeRecord = r
					break
				}
			}
		}
	}

	rankedMatches := extractMatchesByPlaylist(resolver, "ranked")
	start := seasonStartedAt(seasonSlug, seasonsMeta, resolver)
	var seasonMatches []any
	if start == "" {
		seasonMatches = rankedMatches
	} else {
		seasonMatches = make([]any, 0, len(rankedMatches))
		for _, m := range rankedMatches {
			obj := AsObject(m)
			if obj == nil {
				continue
			}
			if sa, ok := obj["started_at"].(string); ok && sa >= start {
				seasonMatches = append(seasonMatches, m)
			}
		}
	}
	rounds := summarizeMatchRounds(resolver, seasonMatches)
	mr := modeRecord

	return RankedStats{
		Season:                  seasonSlug,
		SeasonSlug:              seasonSlug,
		SeasonDisplay:           seasonDisplay(seasonSlug, seasonsMeta, resolver),
		SeasonStartedAt:         start,
		Matches:                 numInt(resolver.Field(mr, "matches")),
		Wins:                    numInt(resolver.Field(mr, "wins")),
		Losses:                  numInt(resolver.Field(mr, "losses")),
		Abandons:                numInt(resolver.Field(mr, "abandons")),
		Kills:                   numInt(resolver.Field(mr, "kills")),
		Deaths:                  numInt(resolver.Field(mr, "deaths")),
		Assists:                 numInt(resolver.Field(mr, "assists")),
		Headshots:               numInt(resolver.Field(mr, "headshots")),
		KDRatio:                 RoundTo(num(resolver.Field(mr, "kd")), 4),
		HeadshotPercentage:      RoundTo(num(resolver.Field(mr, "hs")), 2),
		WinRate:                 RoundTo(num(resolver.Field(mr, "wr")), 2),
		RankPoints:              numInt(resolver.Field(currentSeason, "rank_points")),
		PeakRankPoints:          numInt(resolver.Field(currentSeason, "max_rank_points")),
		CurrentRankSlug:         currentRankSlug,
		CurrentRank:             currentRank,
		CurrentRankTier:         currentRankTier,
		PeakRankSlug:            peakRankSlug,
		PeakRank:                peakRank,
		PeakRankTier:            peakRankTier,
		AllTimePeakRankSlug:     allTimePeakSlug,
		AllTimePeakRank:         allTimePeakRank,
		AllTimePeakRankTier:     allTimePeakRankTier,
		AllTimePeakRankPoints:   max(allTimePeakPoints, 0),
		AllTimePeakRankSeason:   allTimePeakSeason,
		RoundsPlayed:            rounds.roundsPlayed,
		KillRounds:              rounds.killRounds,
		SurvivalRounds:          rounds.survivalRounds,
		TradedRounds:            rounds.tradedRounds,
		OpeningKillRounds:       rounds.openingKillRounds,
		MatchesInCache:          len(seasonMatches),
	}
}
```

- [ ] **Step 5: Add fallback stats builders and the main scrape functions**

Append to `scrape.go`:

```go
type modeRecordSelection struct {
	seasonSlug string
	modeSlug   string
	record     any
}

func findModeRecord(
	seasonModeRecords, seasonsMeta any,
	resolver *NuxtResolver,
	matcher func(string) bool,
) *modeRecordSelection {
	smr := AsObject(resolver.Resolve(seasonModeRecords))
	if smr == nil {
		return nil
	}
	slugs := make([]string, 0, len(smr))
	for k := range smr {
		slugs = append(slugs, k)
	}
	sortSeasonSlugsByStartDesc(slugs, seasonsMeta, resolver)
	var bestZero *modeRecordSelection
	for _, seasonSlug := range slugs {
		seasonModesRaw, ok := smr[seasonSlug]
		if !ok {
			continue
		}
		seasonModes := resolver.Resolve(seasonModesRaw)
		seasonModesObj := AsObject(seasonModes)
		if seasonModesObj == nil {
			continue
		}
		for modeSlugRaw, recordRaw := range seasonModesObj {
			if !matcher(modeSlugRaw) {
				continue
			}
			record := resolver.Resolve(recordRaw)
			if !IsObject(record) {
				continue
			}
			candidate := &modeRecordSelection{
				seasonSlug: seasonSlug,
				modeSlug:   modeSlugRaw,
				record:     record,
			}
			if numInt(resolver.Field(record, "matches")) > 0 {
				return candidate
			}
			if bestZero == nil {
				bestZero = candidate
			}
		}
	}
	return bestZero
}

func buildFallbackRankedModeStats(
	resolver *NuxtResolver,
	seasonModeRecords, seasonsMeta any,
) *RankedStats {
	quick := findModeRecord(seasonModeRecords, seasonsMeta, resolver, func(m string) bool {
		return strings.Contains(m, "quick-match") || strings.Contains(m, "quickmatch")
	})
	selection := quick
	if selection == nil {
		selection = findModeRecord(seasonModeRecords, seasonsMeta, resolver, func(string) bool { return true })
	}
	if selection == nil {
		return nil
	}

	quickMatches := extractMatchesByPlaylist(resolver, "quickmatch")
	pastMatches := quickMatches
	if len(pastMatches) == 0 {
		pastMatches = extractMatchesByPlaylist(resolver, "")
	}
	start := seasonStartedAt(selection.seasonSlug, seasonsMeta, resolver)
	var seasonMatches []any
	if start == "" {
		seasonMatches = pastMatches
	} else {
		seasonMatches = make([]any, 0, len(pastMatches))
		for _, m := range pastMatches {
			obj := AsObject(m)
			if obj == nil {
				continue
			}
			if sa, ok := obj["started_at"].(string); ok && sa >= start {
				seasonMatches = append(seasonMatches, m)
			}
		}
	}
	rounds := summarizeMatchRounds(resolver, seasonMatches)
	rec := selection.record
	matches := numInt(resolver.Field(rec, "matches"))
	if len(seasonMatches) > matches {
		matches = len(seasonMatches)
	}
	wins := numInt(resolver.Field(rec, "wins"))
	losses := numInt(resolver.Field(rec, "losses"))
	kills := numInt(resolver.Field(rec, "kills"))
	deaths := numInt(resolver.Field(rec, "deaths"))
	assists := numInt(resolver.Field(rec, "assists"))
	headshots := numInt(resolver.Field(rec, "headshots"))

	var kd float64
	if deaths > 0 {
		kd = float64(kills) / float64(deaths)
	} else {
		kd = float64(kills)
	}
	var hs float64
	if kills > 0 {
		hs = float64(headshots) / float64(kills) * 100
	}
	var wr float64
	if matches > 0 {
		wr = float64(wins) / float64(matches) * 100
	}
	recObj := AsObject(rec)
	hasKey := func(k string) bool { return recObj != nil && recObj[k] != nil }

	return &RankedStats{
		Season:             selection.seasonSlug,
		SeasonSlug:         selection.seasonSlug,
		SeasonDisplay:      seasonDisplay(selection.seasonSlug, seasonsMeta, resolver),
		SeasonStartedAt:    start,
		Mode:               selection.modeSlug,
		Matches:            matches,
		Wins:               wins,
		Losses:             losses,
		Abandons:           numInt(resolver.Field(rec, "abandons")),
		Kills:              kills,
		Deaths:             deaths,
		Assists:            assists,
		Headshots:          headshots,
		KDRatio:            RoundTo(func() float64 { if hasKey("kd") { return num(resolver.Field(rec, "kd")) }; return kd }(), 4),
		HeadshotPercentage: RoundTo(func() float64 { if hasKey("hs") { return num(resolver.Field(rec, "hs")) }; return hs }(), 2),
		WinRate:            RoundTo(func() float64 { if hasKey("wr") { return num(resolver.Field(rec, "wr")) }; return wr }(), 2),
		CurrentRank:        "Unranked",
		CurrentRankTier:    "Unranked",
		PeakRank:           "Unranked",
		PeakRankTier:       "Unranked",
		AllTimePeakRank:    "Unranked",
		AllTimePeakRankTier:"Unranked",
		RoundsPlayed:       rounds.roundsPlayed,
		KillRounds:         rounds.killRounds,
		SurvivalRounds:     rounds.survivalRounds,
		TradedRounds:       rounds.tradedRounds,
		OpeningKillRounds:  rounds.openingKillRounds,
		MatchesInCache:     len(seasonMatches),
	}
}

func buildFallbackPastMatches(resolver *NuxtResolver) *RankedStats {
	past := extractMatchesByPlaylist(resolver, "")
	if len(past) == 0 {
		return nil
	}
	var kills, deaths, assists, headshots, wins, losses, abandons int
	for _, m := range past {
		s := resolver.Field(m, "player_summary")
		if s == nil {
			continue
		}
		kills += numInt(resolver.Field(s, "kills"))
		deaths += numInt(resolver.Field(s, "deaths"))
		assists += numInt(resolver.Field(s, "assists"))
		headshots += numInt(resolver.Field(s, "headshots"))
		abandons += numInt(resolver.Field(s, "abandons"))
		if obj := AsObject(s); obj != nil {
			won := obj["won"]
			if won == nil {
				won = obj["win"]
			}
			if won != nil {
				v := resolver.Resolve(won)
				if b, ok := v.(bool); ok {
					if b {
						wins++
					} else {
						losses++
					}
				} else if i, ok := v.(float64); ok {
					if i == 1 {
						wins++
					} else if i == 0 {
						losses++
					}
				} else if sv, ok := v.(string); ok {
					switch strings.ToLower(sv) {
					case "win":
						wins++
					case "loss":
						losses++
					}
				}
			}
		}
	}
	rounds := summarizeMatchRounds(resolver, past)
	matches := len(past)
	var kd float64
	if deaths > 0 {
		kd = float64(kills) / float64(deaths)
	} else {
		kd = float64(kills)
	}
	var hs float64
	if kills > 0 {
		hs = float64(headshots) / float64(kills) * 100
	}
	var wr float64
	if matches > 0 {
		wr = float64(wins) / float64(matches) * 100
	}
	return &RankedStats{
		SeasonDisplay:      "Recent Matches",
		Mode:               "past-matches",
		Matches:            matches,
		Wins:               wins,
		Losses:             losses,
		Abandons:           abandons,
		Kills:              kills,
		Deaths:             deaths,
		Assists:            assists,
		Headshots:          headshots,
		KDRatio:            RoundTo(kd, 4),
		HeadshotPercentage: RoundTo(hs, 2),
		WinRate:            RoundTo(wr, 2),
		CurrentRank:        "Unranked",
		CurrentRankTier:    "Unranked",
		PeakRank:           "Unranked",
		PeakRankTier:       "Unranked",
		AllTimePeakRank:    "Unranked",
		AllTimePeakRankTier:"Unranked",
		RoundsPlayed:       rounds.roundsPlayed,
		KillRounds:         rounds.killRounds,
		SurvivalRounds:     rounds.survivalRounds,
		TradedRounds:       rounds.tradedRounds,
		OpeningKillRounds:  rounds.openingKillRounds,
		MatchesInCache:     matches,
	}
}
```

- [ ] **Step 6: Add the main public API functions**

Append to `scrape.go`:

```go
// ScrapeHTMLStatsCollection parses HTML and extracts stats for all seasons.
func ScrapeHTMLStatsCollection(html string) ScrapedStatsCollection {
	payloadStr, ok := ExtractNuxtPayload(html)
	if !ok {
		return ScrapedStatsCollection{}
	}
	var payload []any
	if err := gojson.Unmarshal([]byte(payloadStr), &payload); err != nil {
		return ScrapedStatsCollection{}
	}
	return scrapePayload(payload)
}

func scrapePayload(payload []any) ScrapedStatsCollection {
	resolver := NewNuxtResolver(payload)
	pi, ci, ok := findProfileAndConstantsIndices(payload)
	if !ok {
		return ScrapedStatsCollection{}
	}
	profileVal := resolver.ResolveIndex(pi)
	if !IsObject(profileVal) {
		return ScrapedStatsCollection{}
	}
	constantsVal := resolver.ResolveIndex(ci)
	if !IsObject(constantsVal) {
		return ScrapedStatsCollection{}
	}
	rankedSeasons := resolver.Field(profileVal, "ranked_season_records")
	seasonModeRecords := resolver.Field(profileVal, "season_mode_records")
	seasonsMeta := resolver.Field(constantsVal, "seasons")
	ranks := resolver.Field(constantsVal, "ranks")
	rankTiers := resolver.Field(constantsVal, "rank_tiers")
	base := baseProfile(profileVal, resolver)
	catalog := buildSeasonCatalog(rankedSeasons, seasonsMeta, resolver)
	bySeason := make(map[string]ScrapedStats, len(catalog))
	for _, entry := range catalog {
		ranked := buildRankedForSeason(resolver, rankedSeasons, seasonModeRecords, seasonsMeta, ranks, rankTiers, entry.Slug)
		bySeason[entry.Slug] = toScraped(base, ranked)
	}
	var latest ScrapedStats
	if len(catalog) > 0 {
		if s, ok := bySeason[catalog[0].Slug]; ok {
			latest = s
		} else {
			latest = toScraped(base, RankedStats{})
		}
	} else {
		ranked := buildFallbackRankedModeStats(resolver, seasonModeRecords, seasonsMeta)
		if ranked == nil {
			r := buildFallbackPastMatches(resolver)
			if r != nil {
				ranked = r
			} else {
				ranked = &RankedStats{}
			}
		}
		latest = toScraped(base, *ranked)
	}
	return ScrapedStatsCollection{
		Latest:        latest,
		BySeason:      bySeason,
		SeasonCatalog: catalog,
	}
}

// ScrapeHTMLStats parses HTML and returns stats for a specific season (or latest).
func ScrapeHTMLStats(html string, seasonSelector string) ScrapedStats {
	collection := ScrapeHTMLStatsCollection(html)
	if seasonSelector != "" {
		if slug := CanonicalizeSeasonSelector(seasonSelector, collection.SeasonCatalog); slug != "" {
			if s, ok := collection.BySeason[slug]; ok {
				return s
			}
		}
	}
	return collection.Latest
}

// slugCanon normalizes a slug or display name for comparison.
func slugCanon(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	prevSep := false
	started := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		isSep := c == ' ' || c == '_' || c == '-' || c == '\t'
		if isSep {
			if !started {
				continue
			}
			if prevSep {
				continue
			}
			prevSep = true
			b.WriteByte('-')
			continue
		}
		prevSep = false
		started = true
		if c >= 'A' && c <= 'Z' {
			b.WriteByte(c + 32)
		} else {
			b.WriteByte(c)
		}
	}
	return b.String()
}

// CanonicalizeSeasonSelector matches a user-provided selector against the
// season catalog, trying slug match first, then display name match.
func CanonicalizeSeasonSelector(selector string, catalog []SeasonCatalogEntry) string {
	trimmed := strings.TrimSpace(selector)
	if trimmed == "" {
		return ""
	}
	for _, entry := range catalog {
		if slugCanon(entry.Slug) == slugCanon(trimmed) {
			return entry.Slug
		}
	}
	for _, entry := range catalog {
		if slugCanon(entry.Display) == slugCanon(trimmed) {
			return entry.Slug
		}
	}
	return ""
}
```

- [ ] **Step 7: Verify compilation**

Run:
```bash
cd /Users/juwen/dev/commerce/parley && go build ./internal/stats/scrape/
```

Expected: clean compile.

---

### Task 7: Create `internal/stats/scrape/scrape_test.go`

Port of the inline tests in `src/scrape.rs`.

**Files:**
- Create: `internal/stats/scrape/scrape_test.go`

- [ ] **Step 1: Write the scrape tests**

```go
package scrape

import (
	"testing"

	gojson "github.com/goccy/go-json"
)

func wrapInNuxtHTML(payload any) string {
	b, _ := gojson.Marshal(payload)
	return `<html><head><script id="__NUXT_DATA__" type="application/json">` + string(b) + `</script></head><body></body></html>`
}

func TestExtractsNuxtPayload(t *testing.T) {
	p := []any{float64(1), "hello"}
	html := wrapInNuxtHTML(p)
	out, ok := ExtractNuxtPayload(html)
	if !ok {
		t.Fatal("expected payload extraction to succeed")
	}
	expected, _ := gojson.Marshal(p)
	if len(out) != len(string(expected)) {
		t.Errorf("payload length: got %d, want %d", len(out), len(string(expected)))
	}
}

func TestEmptyHTMLYieldsDefaultCollection(t *testing.T) {
	c := ScrapeHTMLStatsCollection("<html></html>")
	if len(c.SeasonCatalog) != 0 {
		t.Errorf("expected empty season catalog, got %d", len(c.SeasonCatalog))
	}
	if len(c.BySeason) != 0 {
		t.Errorf("expected empty by_season, got %d", len(c.BySeason))
	}
}

func TestSeasonSelectorCanonicalisesDisplayName(t *testing.T) {
	catalog := []SeasonCatalogEntry{
		{Slug: "prep-phase", Display: "Prep Phase", StartedAt: "2026-01-01"},
	}
	if got := CanonicalizeSeasonSelector("Prep Phase", catalog); got != "prep-phase" {
		t.Errorf("Prep Phase: got %q, want %q", got, "prep-phase")
	}
	if got := CanonicalizeSeasonSelector("prep_phase", catalog); got != "prep-phase" {
		t.Errorf("prep_phase: got %q, want %q", got, "prep-phase")
	}
	if got := CanonicalizeSeasonSelector("  PREP-phase ", catalog); got != "prep-phase" {
		t.Errorf("PREP-phase: got %q, want %q", got, "prep-phase")
	}
	if got := CanonicalizeSeasonSelector("unknown", catalog); got != "" {
		t.Errorf("unknown: got %q, want empty", got)
	}
}

func TestSlugCanon(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"prep-phase", "prep-phase", true},
		{"prep_phase", "prep-phase", true},
		{"  PREP-phase ", "prep-phase", true},
		{"prep--phase", "prep-phase", true},
		{"unknown", "prep-phase", false},
	}
	for _, tt := range tests {
		got := slugCanon(tt.a) == slugCanon(tt.b)
		if got != tt.want {
			t.Errorf("slugCanon(%q, %q): got %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}
```

- [ ] **Step 2: Run all tests**

Run:
```bash
cd /Users/juwen/dev/commerce/parley && go test ./internal/stats/scrape/ -v
```

Expected: all tests pass.

---

### Task 8: Final verification

- [ ] **Step 1: Run go vet**

```bash
cd /Users/juwen/dev/commerce/parley && go vet ./internal/stats/scrape/
```

Expected: clean.

- [ ] **Step 2: Run tests one final time**

```bash
cd /Users/juwen/dev/commerce/parley && go test ./internal/stats/scrape/ -v -count=1
```

Expected: all tests pass.
