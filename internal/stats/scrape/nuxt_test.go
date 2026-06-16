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
