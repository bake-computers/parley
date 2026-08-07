package models

import "github.com/uptrace/bun"

// DiscordProfile maps to table discord_profiles.
type DiscordProfile struct {
	bun.BaseModel `bun:"table:discord_profiles,alias:dp"`

	DiscordUserID      string  `bun:"discord_user_id,pk,notnull"`
	Username           string  `bun:"username,notnull"`
	UsernameNormalized string  `bun:"username_normalized,notnull"`
	GlobalName         *string `bun:"global_name"`
	AvatarHash         *string `bun:"avatar_hash"`
	CreatedAt          int64   `bun:"created_at,notnull"`
	UpdatedAt          int64   `bun:"updated_at,notnull"`
}

// NewDiscordProfile is the insert shape for discord_profiles.
type NewDiscordProfile struct {
	bun.BaseModel `bun:"table:discord_profiles,alias:dp"`

	DiscordUserID      string  `bun:"discord_user_id,notnull"`
	Username           string  `bun:"username,notnull"`
	UsernameNormalized string  `bun:"username_normalized,notnull"`
	GlobalName         *string `bun:"global_name"`
	AvatarHash         *string `bun:"avatar_hash"`
	CreatedAt          int64   `bun:"created_at,notnull"`
	UpdatedAt          int64   `bun:"updated_at,notnull"`
}

// DiscordUsernameHistory maps to table discord_username_history.
type DiscordUsernameHistory struct {
	bun.BaseModel `bun:"table:discord_username_history,alias:duh"`

	ID                 int64  `bun:"id,pk,autoincrement"`
	DiscordUserID      string `bun:"discord_user_id,notnull"`
	Username           string `bun:"username,notnull"`
	UsernameNormalized string `bun:"username_normalized,notnull"`
	ClaimedAt          int64  `bun:"claimed_at,notnull"`
}

// NewDiscordUsernameHistory is the insert shape for discord_username_history.
type NewDiscordUsernameHistory struct {
	bun.BaseModel `bun:"table:discord_username_history,alias:duh"`

	DiscordUserID      string `bun:"discord_user_id,notnull"`
	Username           string `bun:"username,notnull"`
	UsernameNormalized string `bun:"username_normalized,notnull"`
	ClaimedAt          int64  `bun:"claimed_at,notnull"`
}

// RatingHistorySource identifies why a rating_history row was written.
const (
	RatingHistorySourceMatch = "match"
	RatingHistorySourceSeed  = "seed"
)

// RatingHistory maps to table rating_history.
type RatingHistory struct {
	bun.BaseModel `bun:"table:rating_history,alias:rh"`

	ID              int64    `bun:"id,pk,autoincrement"`
	DiscordUserID   string   `bun:"discord_user_id,notnull"`
	Game            Game     `bun:"game,notnull"`
	PlayerID        int32    `bun:"player_id,notnull"`
	Elo             float64  `bun:"elo,notnull"`
	RatingDeviation *float64 `bun:"rating_deviation"`
	Delta           *float64 `bun:"delta"`
	Source          string   `bun:"source,notnull"`
	MatchID         *int32   `bun:"match_id"`
	RecordedAt      int64    `bun:"recorded_at,notnull"`
}

// NewRatingHistory is the insert shape for rating_history.
type NewRatingHistory struct {
	bun.BaseModel `bun:"table:rating_history,alias:rh"`

	DiscordUserID   string   `bun:"discord_user_id,notnull"`
	Game            Game     `bun:"game,notnull"`
	PlayerID        int32    `bun:"player_id,notnull"`
	Elo             float64  `bun:"elo,notnull"`
	RatingDeviation *float64 `bun:"rating_deviation"`
	Delta           *float64 `bun:"delta"`
	Source          string   `bun:"source,notnull"`
	MatchID         *int32   `bun:"match_id"`
	RecordedAt      int64    `bun:"recorded_at,notnull"`
}

// PlayerCareerStats is an aggregate of Parley match_participants K/D/A.
type PlayerCareerStats struct {
	Kills   int64 `bun:"kills"`
	Deaths  int64 `bun:"deaths"`
	Assists int64 `bun:"assists"`
}
