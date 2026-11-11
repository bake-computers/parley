package repos

import "testing"

func TestNormalizeDiscordUsername(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"sampleplayer", "sampleplayer"},
		{"@sampleplayer", "sampleplayer"},
		{"  @SamplePlayer  ", "sampleplayer"},
		{"@@foo", "@foo"},
		{"", ""},
		{"   ", ""},
	}
	for _, tc := range tests {
		if got := NormalizeDiscordUsername(tc.in); got != tc.want {
			t.Errorf("NormalizeDiscordUsername(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestIsParkedDiscordUsername(t *testing.T) {
	if !IsParkedDiscordUsername("parked_1234567890") {
		t.Fatal("expected parked handle")
	}
	if !IsParkedDiscordUsername("PARKED_abc") {
		t.Fatal("expected parked handle case-insensitive")
	}
	if IsParkedDiscordUsername("sampleplayer") {
		t.Fatal("a normal handle must not be parked")
	}
	if IsParkedDiscordUsername("") {
		t.Fatal("empty is not parked")
	}
}

func TestIsUniqueViolation(t *testing.T) {
	if isUniqueViolation(nil) {
		t.Fatal("nil is not unique violation")
	}
}
