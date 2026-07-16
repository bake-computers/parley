package api

// Config is the /v2/config payload (metadata keyed by slug).
type Config struct {
	Constants struct {
		Slugs struct {
			CurrentSeason              string   `json:"current_season"`
			RankedPlaylist             string   `json:"ranked_playlist"`
			QuickMatchPlaylist         string   `json:"quick_match_playlist"`
			RankedBombMode             string   `json:"ranked_bomb_mode"`
			UnrankedRank               string   `json:"unranked_rank"`
			ChampionRank               string   `json:"champion_rank"`
			CanceledEndGameReason      string   `json:"canceled_end_game_reason"`
			FinishedEndGameReason      string   `json:"finished_end_game_reason"`
			CheatingGameBanReasons     []string `json:"cheating_game_ban_reasons"`
			CheatingExternalBanReasons []string `json:"cheating_external_ban_reasons"`
		} `json:"slugs"`
	} `json:"constants"`
	Seasons   map[string]SeasonMeta `json:"seasons"`
	Ranks     map[string]RankMeta   `json:"ranks"`
	RankTiers map[string]TierMeta   `json:"rank_tiers"`
}

type SeasonMeta struct {
	Slug         string `json:"slug"`
	Display      string `json:"display"`
	StartedAt    string `json:"started_at"`
	EndedAt      string `json:"ended_at"`
	IsFilterable bool   `json:"is_filterable"`
}

type RankMeta struct {
	Slug    string `json:"slug"`
	Display string `json:"display"`
	Tier    string `json:"tier"`
}

type TierMeta struct {
	Slug    string `json:"slug"`
	Display string `json:"display"`
}

// SearchHit is one entry from GET /v2/profiles/search.
type SearchHit struct {
	Type    string        `json:"type"`
	Profile SearchProfile `json:"profile"`
}

type SearchProfile struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Platform string `json:"platform"`
	Level    int32  `json:"level"`
}

// Profile is the full GET /v2/profiles/{id} payload.
type Profile struct {
	ID                  string                           `json:"id"`
	Username            string                           `json:"username"`
	Platform            string                           `json:"platform"`
	Level               int32                            `json:"level"`
	RankedSeasonRecords map[string]RankedSeasonRecord    `json:"ranked_season_records"`
	SeasonModeRecords   map[string]map[string]ModeRecord `json:"season_mode_records"`
}

type RankedSeasonRecord struct {
	Season        string `json:"season"`
	Rank          string `json:"rank"`
	MaxRank       string `json:"max_rank"`
	RankPoints    int32  `json:"rank_points"`
	MaxRankPoints int32  `json:"max_rank_points"`
}

type ModeRecord struct {
	Season    string  `json:"season"`
	Mode      string  `json:"mode"`
	Matches   int32   `json:"matches"`
	Wins      int32   `json:"wins"`
	Losses    int32   `json:"losses"`
	Abandons  int32   `json:"abandons"`
	Kills     int32   `json:"kills"`
	Deaths    int32   `json:"deaths"`
	Assists   int32   `json:"assists"`
	Headshots int32   `json:"headshots"`
	KD        float64 `json:"kd"`
	HS        float64 `json:"hs"`
	WR        float64 `json:"wr"`
}

// Match is one ranked match from GET /v2/profiles/{id}/matches.
type Match struct {
	ID            string         `json:"id"`
	Playlist      string         `json:"playlist"`
	Mode          string         `json:"mode"`
	StartedAt     string         `json:"started_at"`
	EndedAt       string         `json:"ended_at"`
	PlayerSummary *PlayerSummary `json:"player_summary"`
}

type PlayerSummary struct {
	Rounds             int32 `json:"rounds"`
	RoundSurvivals     int32 `json:"round_survivals"`
	Trades             int32 `json:"trades"`
	OpeningKills       int32 `json:"opening_kills"`
	Kills              int32 `json:"kills"`
	Deaths             int32 `json:"deaths"`
	OpeningDeaths      int32 `json:"opening_deaths"`
	HeadshotOnlyRounds int32 `json:"headshot_only_rounds"`
	Clutch1v1Wins      int32 `json:"clutch_1v1_wins"`
	Clutch1v2Wins      int32 `json:"clutch_1v2_wins"`
	Clutch1v3Wins      int32 `json:"clutch_1v3_wins"`
	Kills2K            int32 `json:"kills_2k"`
	Kills3K            int32 `json:"kills_3k"`
	Kills4K            int32 `json:"kills_4k"`
	Kills5K            int32 `json:"kills_5k"`
}

// Session is one ranked session from GET /v2/profiles/{id}/sessions.
type Session struct {
	Wins            int32  `json:"wins"`
	Losses          int32  `json:"losses"`
	Abandons        int32  `json:"abandons"`
	RankPointsDelta int32  `json:"rank_points_delta"`
	Rank            string `json:"rank"`
	RankPoints      int32  `json:"rank_points"`
	CreatedAt       string `json:"created_at"`
}
