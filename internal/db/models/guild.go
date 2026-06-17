package models

import "github.com/uptrace/bun"

// GuildMembership is a row in `guild_memberships`.
type GuildMembership struct {
	bun.BaseModel `bun:"table:guild_memberships,alias:gm"`

	ID                int32   `bun:"id,pk,autoincrement"`
	Game              Game    `bun:"game,notnull"`
	GuildID           string  `bun:"guild_id,notnull"`
	DiscordUserID     string  `bun:"discord_user_id,notnull"`
	PlayerID          int32   `bun:"player_id,notnull"`
	InternalElo       float64 `bun:"internal_elo,notnull"`
	RatingDeviation   float64 `bun:"rating_deviation,notnull"`
	InternalMatches   int32   `bun:"internal_matches,notnull"`
	InternalWins      int32   `bun:"internal_wins,notnull"`
	InternalLosses    int32   `bun:"internal_losses,notnull"`
	InternalUpdatedAt *int64  `bun:"internal_updated_at"`
	CreatedAt         int64   `bun:"created_at,notnull"`
	UpdatedAt         int64   `bun:"updated_at,notnull"`
}

// GuildSettings is a row in `guild_settings`.
type GuildSettings struct {
	bun.BaseModel `bun:"table:guild_settings,alias:gs"`

	GuildID                string   `bun:"guild_id,pk,notnull"`
	Game                   Game     `bun:"game,pk,notnull"`
	DefaultTeamFormat      *string  `bun:"default_team_format"`
	AutoBalance            bool     `bun:"auto_balance,notnull"`
	CrossGuildMatchmaking  bool     `bun:"cross_guild_matchmaking,notnull"`
	UpdatedAt              int64    `bun:"updated_at,notnull"`
	UpdatedByDiscordUserID string   `bun:"updated_by_discord_user_id,notnull"`
	DefaultLanguage        Language `bun:"default_language,notnull"`
	MatchmakingEnabled     bool     `bun:"matchmaking_enabled,notnull"`
}

// GuildMatchmakingRules is a row in `guild_matchmaking_rules`.
type GuildMatchmakingRules struct {
	bun.BaseModel `bun:"table:guild_matchmaking_rules,alias:gmr"`

	GuildID         string   `bun:"guild_id,pk,notnull"`
	Game            Game     `bun:"game,pk,notnull"`
	MinElo          *int32   `bun:"min_elo"`
	MaxElo          *int32   `bun:"max_elo"`
	Platforms       []string `bun:"platforms,array"`
	RequireVerified bool     `bun:"require_verified,notnull"`
	MaxEloGap       int32    `bun:"max_elo_gap,notnull"`
	UpdatedAt       int64    `bun:"updated_at,notnull"`
}

// GuildNotificationSettings is a row in `guild_notification_settings`.
type GuildNotificationSettings struct {
	bun.BaseModel `bun:"table:guild_notification_settings,alias:gns"`

	GuildID                        string  `bun:"guild_id,pk,notnull"`
	Game                           Game    `bun:"game,pk,notnull"`
	MatchResultsChannel            *string `bun:"match_results_channel"`
	TournamentAnnouncementsChannel *string `bun:"tournament_announcements_channel"`
	LeaderboardUpdatesEnabled      bool    `bun:"leaderboard_updates_enabled,notnull"`
	UpdatedAt                      int64   `bun:"updated_at,notnull"`
	CrossGuildAnnouncementsEnabled bool    `bun:"cross_guild_announcements_enabled,notnull"`
	AnnounceMatchReadyEnabled      bool    `bun:"announce_match_ready_enabled,notnull"`
	AnnounceMatchResultsEnabled    bool    `bun:"announce_match_results_enabled,notnull"`
}

// GuildMatchQuota is a row in `guild_match_quotas`.
type GuildMatchQuota struct {
	bun.BaseModel `bun:"table:guild_match_quotas,alias:gq"`

	ID                     int32  `bun:"id,pk,autoincrement"`
	Game                   Game   `bun:"game,notnull"`
	GuildID                string `bun:"guild_id,notnull"`
	DailyMatchLimit        int32  `bun:"daily_match_limit,notnull"`
	UpdatedByDiscordUserID string `bun:"updated_by_discord_user_id,notnull"`
	CreatedAt              int64  `bun:"created_at,notnull"`
	UpdatedAt              int64  `bun:"updated_at,notnull"`
}

// AccountDeletionCooldown is a row in `account_deletion_cooldowns`.
type AccountDeletionCooldown struct {
	bun.BaseModel `bun:"table:account_deletion_cooldowns,alias:adc"`

	DiscordUserIDHash string `bun:"discord_user_id_hash,pk,notnull"`
	DeletedAt         int64  `bun:"deleted_at,notnull"`
	CooldownUntil     int64  `bun:"cooldown_until,notnull"`
}
