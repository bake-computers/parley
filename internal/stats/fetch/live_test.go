//go:build integration

package fetch

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/bake-computers/parley/internal/stats/api"
)

func TestLiveStatsCCAPI_Avqny(t *testing.T) {
	key := os.Getenv("STATS_CC_API_KEY")
	if key == "" {
		t.Skip("STATS_CC_API_KEY unset")
	}

	cache := api.NewConfigCache(nil, 7*time.Minute)
	client := NewStatsClientFromOptions(ClientOptions{
		APIKey:      key,
		APIBaseURL:  getenvDefault("STATS_CC_API_BASE_URL", "https://r6.stats.cc"),
		ConfigCache: cache,
	}).WithRetry(DefaultRetryPolicy())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	collection, err := client.FetchStatsCollection(ctx, "Avqny", StatsPlatformPC)
	if err != nil {
		t.Fatalf("FetchStatsCollection: %v", err)
	}
	if !client.APIEnabled() {
		t.Fatal("expected API enabled")
	}
	if collection.Latest.Profile.ProfileID == "" {
		t.Fatal("missing profile_id")
	}
	if collection.Latest.RankedStats.RankPoints <= 0 {
		t.Fatalf("rank_points = %d", collection.Latest.RankedStats.RankPoints)
	}
	if len(collection.SeasonCatalog) == 0 {
		t.Fatal("empty season catalog")
	}
	if collection.Latest.RankedStats.MatchesInCache <= 0 {
		t.Fatalf("matches_in_cache = %d", collection.Latest.RankedStats.MatchesInCache)
	}
	t.Logf("api ok profile=%s rank_points=%d kost=%.2f seasons=%d",
		collection.Latest.Profile.ProfileID,
		collection.Latest.RankedStats.RankPoints,
		collection.Latest.CalculatedMetrics.KOST,
		len(collection.SeasonCatalog),
	)
}

func getenvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
