package server

import (
	"strings"
	"testing"

	userv1 "github.com/bake-computers/parley/gen/parley/user/v1"
)

// The web worker cannot distinguish a saved `false` from an omitted field, so the
// JSON codec must emit zero values. A regression here silently reverts any boolean
// the user toggles off in the dashboard.
func TestEmitDefaultJSONCodecEmitsFalseBooleans(t *testing.T) {
	codec := &emitDefaultJSONCodec{name: "json"}

	msg := &userv1.UserSettings{
		DiscordUserId:      "123",
		MatchmakingEnabled: false,
		ProfilePublic:      false,
	}

	out, err := codec.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	body := string(out)

	for _, want := range []string{`"matchmakingEnabled":false`, `"profilePublic":false`} {
		if !strings.Contains(body, want) {
			t.Errorf("expected %s in JSON, got %s", want, body)
		}
	}
}

func TestEmitDefaultJSONCodecRoundTrip(t *testing.T) {
	codec := &emitDefaultJSONCodec{name: "json"}

	in := &userv1.UserSettings{DiscordUserId: "123", MatchmakingEnabled: true, ProfilePublic: false}
	out, err := codec.Marshal(in)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded userv1.UserSettings
	if err := codec.Unmarshal(out, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if decoded.GetDiscordUserId() != "123" || decoded.GetMatchmakingEnabled() != true || decoded.GetProfilePublic() != false {
		t.Errorf("round trip mismatch: %+v", &decoded)
	}
}
