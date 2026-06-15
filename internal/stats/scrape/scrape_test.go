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
		got := slugCanonNormalise(tt.a) == slugCanonNormalise(tt.b)
		if got != tt.want {
			t.Errorf("slugCanon(%q, %q): got %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}
