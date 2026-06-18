package api_test

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/pactum-computers/parley/internal/stats/api"
)

func loadFixture[T any](t *testing.T, name string) T {
	t.Helper()
	raw, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal %s: %v", name, err)
	}
	return out
}

func TestMapCollection_FromFixtures(t *testing.T) {
	cfg := loadFixture[*api.Config](t, "config.json")
	profile := loadFixture[*api.Profile](t, "profile.json")
	matches := loadFixture[[]api.Match](t, "matches.json")

	collection := api.MapCollection(api.MapInput{
		Config:   cfg,
		Profile:  profile,
		Matches:  matches,
		Username: "Avqny",
	})

	if collection.Latest.Profile.Username != "Avqny" {
		t.Fatalf("username = %q", collection.Latest.Profile.Username)
	}
	if collection.Latest.Profile.ProfileID == "" {
		t.Fatal("expected profile_id")
	}
	if collection.Latest.Profile.Platform != "pc" {
		t.Fatalf("platform = %q", collection.Latest.Profile.Platform)
	}
	if len(collection.SeasonCatalog) == 0 {
		t.Fatal("expected season catalog")
	}
	if collection.Latest.RankedStats.RankPoints <= 0 {
		t.Fatalf("rank_points = %d", collection.Latest.RankedStats.RankPoints)
	}
	if collection.Latest.RankedStats.Matches <= 0 {
		t.Fatalf("matches = %d", collection.Latest.RankedStats.Matches)
	}
	if collection.Latest.CalculatedMetrics.KOST <= 0 {
		t.Fatalf("kost = %f", collection.Latest.CalculatedMetrics.KOST)
	}
}
