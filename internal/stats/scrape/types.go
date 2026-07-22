// Package scrape holds parsed stats.cc payload types (no network I/O).
// Ported from src/scrape.rs.
package scrape

// StatsProfile is a single player profile block.
type StatsProfile struct {
	Username   string `json:"username"`
	Level      int32  `json:"level"`
	ProfileID  string `json:"profile_id,omitempty"`
	Platform   string `json:"platform,omitempty"`
	ProfileURL string `json:"profile_url,omitempty"`
}

// RankedStats matches proto.stats.v1.RankedStats fields used by the engine.
type RankedStats struct {
	Season                string  `json:"season"`
	SeasonSlug            string  `json:"season_slug"`
	SeasonDisplay         string  `json:"season_display"`
	SeasonStartedAt       string  `json:"season_started_at"`
	Mode                  string  `json:"mode"`
	Matches               int32   `json:"matches"`
	Wins                  int32   `json:"wins"`
	Losses                int32   `json:"losses"`
	Abandons              int32   `json:"abandons"`
	Kills                 int32   `json:"kills"`
	Deaths                int32   `json:"deaths"`
	Assists               int32   `json:"assists"`
	Headshots             int32   `json:"headshots"`
	KDRatio               float64 `json:"kd_ratio"`
	HeadshotPct           float64 `json:"headshot_percentage"`
	WinRate               float64 `json:"win_rate"`
	RankPoints            int32   `json:"rank_points"`
	PeakRankPoints        int32   `json:"peak_rank_points"`
	CurrentRankSlug       string  `json:"current_rank_slug"`
	CurrentRank           string  `json:"current_rank"`
	CurrentRankTier       string  `json:"current_rank_tier"`
	PeakRankSlug          string  `json:"peak_rank_slug"`
	PeakRank              string  `json:"peak_rank"`
	PeakRankTier          string  `json:"peak_rank_tier"`
	AllTimePeakRankSlug   string  `json:"all_time_peak_rank_slug"`
	AllTimePeakRank       string  `json:"all_time_peak_rank"`
	AllTimePeakRankTier   string  `json:"all_time_peak_rank_tier"`
	AllTimePeakRankPoints int32   `json:"all_time_peak_rank_points"`
	AllTimePeakRankSeason string  `json:"all_time_peak_rank_season"`
	RoundsPlayed          int32   `json:"rounds_played"`
	KillRounds            int32   `json:"kill_rounds"`
	SurvivalRounds        int32   `json:"survival_rounds"`
	TradedRounds          int32   `json:"traded_rounds"`
	OpeningKillRounds     int32   `json:"opening_kill_rounds"`
	MatchesInCache        int32   `json:"matches_in_cache"`
	RollupKills           int32   `json:"rollup_kills"`
	RollupDeaths          int32   `json:"rollup_deaths"`
	OpeningDeathRounds    int32   `json:"opening_death_rounds"`
	HeadshotOnlyRounds    int32   `json:"headshot_only_rounds"`
	Clutch1v1Wins         int32   `json:"clutch_1v1_wins"`
	Clutch1v2Wins         int32   `json:"clutch_1v2_wins"`
	Clutch1v3Wins         int32   `json:"clutch_1v3_wins"`
}

// CalculatedMetrics holds derived metrics from aggregated summaries.
type CalculatedMetrics struct {
	KOST            float64 `json:"kost"`
	KOSTLowerBound  float64 `json:"kost_lower_bound"`
	KOSTUpperBound  float64 `json:"kost_upper_bound"`
	KOSTDescription string  `json:"kost_description"`
}

// ScrapedStats is one season's scraped profile + ranked block.
type ScrapedStats struct {
	Profile           StatsProfile      `json:"profile"`
	RankedStats       RankedStats       `json:"ranked_stats"`
	CalculatedMetrics CalculatedMetrics `json:"calculated_metrics"`
}

// SeasonCatalogEntry describes a season in the upstream catalog.
type SeasonCatalogEntry struct {
	Slug      string `json:"slug"`
	Display   string `json:"display"`
	StartedAt string `json:"started_at"`
}

// ScrapedStatsCollection is latest stats plus per-season map and catalog.
type ScrapedStatsCollection struct {
	Latest        ScrapedStats            `json:"latest"`
	BySeason      map[string]ScrapedStats `json:"by_season"`
	SeasonCatalog []SeasonCatalogEntry    `json:"season_catalog"`
}
