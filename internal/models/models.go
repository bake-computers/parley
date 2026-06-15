// Package models holds bun ORM structs mirroring src/db/models.rs and schema.rs.
package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// Game is the Postgres `games` enum.
type Game string

const (
	GameR6         Game = "r6"
	GameBrawlStars Game = "brawl_stars"
)

func (g *Game) Scan(src any) error {
	if src == nil {
		return errors.New("models: scan Game: nil")
	}
	switch v := src.(type) {
	case string:
		*g = Game(v)
	case []byte:
		*g = Game(string(v))
	default:
		return fmt.Errorf("models: scan Game: unsupported type %T", src)
	}
	if *g != GameR6 && *g != GameBrawlStars {
		return fmt.Errorf("models: unknown game %q", *g)
	}
	return nil
}

func (g Game) Value() (driver.Value, error) {
	if g != GameR6 && g != GameBrawlStars {
		return nil, fmt.Errorf("models: invalid game %q", g)
	}
	return string(g), nil
}

// Language is the Postgres `languages` enum.
type Language string

const (
	LanguageEn Language = "en"
	LanguageDe Language = "de"
)

func (l *Language) Scan(src any) error {
	if src == nil {
		return errors.New("models: scan Language: nil")
	}
	switch v := src.(type) {
	case string:
		*l = Language(v)
	case []byte:
		*l = Language(string(v))
	default:
		return fmt.Errorf("models: scan Language: unsupported type %T", src)
	}
	if *l != LanguageEn && *l != LanguageDe {
		return fmt.Errorf("models: unknown language %q", *l)
	}
	return nil
}

func (l Language) Value() (driver.Value, error) {
	if l != LanguageEn && l != LanguageDe {
		return nil, fmt.Errorf("models: invalid language %q", l)
	}
	return string(l), nil
}

// Player maps to table players.
type Player struct {
	bun.BaseModel `bun:"table:players,alias:player"`

	ID                 int32   `bun:",pk,autoincrement"`
	Game               Game    `bun:",notnull"`
	ProfileID          *string `bun:"profile_id"`
	Username           string  `bun:",notnull"`
	UsernameNormalized string  `bun:"username_normalized,notnull"`
	Platform           string  `bun:",notnull"`
	ProfileURL         *string `bun:"profile_url"`
	Level              int32   `bun:",notnull"`
	InternalElo        float64 `bun:"internal_elo,notnull"`
	InternalMatches    int32   `bun:"internal_matches,notnull"`
	InternalWins       int32   `bun:"internal_wins,notnull"`
	InternalLosses     int32   `bun:"internal_losses,notnull"`
	InternalUpdatedAt  *int64  `bun:"internal_updated_at"`
	CreatedAt          int64   `bun:"created_at,notnull"`
	UpdatedAt          int64   `bun:"updated_at,notnull"`
}

// NewPlayer is the insert shape for players.
type NewPlayer struct {
	bun.BaseModel `bun:"table:players,alias:player"`

	Game               Game    `bun:",notnull"`
	ProfileID          *string `bun:"profile_id"`
	Username           string  `bun:",notnull"`
	UsernameNormalized string  `bun:"username_normalized,notnull"`
	Platform           string  `bun:",notnull"`
	ProfileURL         *string `bun:"profile_url"`
	Level              int32   `bun:",notnull"`
	InternalElo        float64 `bun:"internal_elo,notnull"`
	InternalMatches    int32   `bun:"internal_matches,notnull"`
	InternalWins       int32   `bun:"internal_wins,notnull"`
	InternalLosses     int32   `bun:"internal_losses,notnull"`
	InternalUpdatedAt  *int64  `bun:"internal_updated_at"`
	CreatedAt          int64   `bun:"created_at,notnull"`
	UpdatedAt          int64   `bun:"updated_at,notnull"`
}

// PlayerChangeset is the partial update shape for players.
type PlayerChangeset struct {
	bun.BaseModel `bun:"table:players,alias:player"`

	ProfileID          **string `bun:"profile_id"`
	Username           *string  `bun:"username"`
	UsernameNormalized *string  `bun:"username_normalized"`
	Platform           *string  `bun:"platform"`
	ProfileURL         **string `bun:"profile_url"`
	Level              *int32   `bun:"level"`
	InternalElo        *float64 `bun:"internal_elo"`
	InternalMatches    *int32   `bun:"internal_matches"`
	InternalWins       *int32   `bun:"internal_wins"`
	InternalLosses     *int32   `bun:"internal_losses"`
	InternalUpdatedAt  **int64  `bun:"internal_updated_at"`
	UpdatedAt          *int64   `bun:"updated_at"`
}

// DiscordIdentity maps to table discord_identities.
type DiscordIdentity struct {
	bun.BaseModel `bun:"table:discord_identities,alias:di"`

	ID            int32  `bun:",pk,autoincrement"`
	Game          Game   `bun:",notnull"`
	DiscordUserID string `bun:"discord_user_id,notnull"`
	PlayerID      int32  `bun:"player_id,notnull"`
	CreatedAt     int64  `bun:"created_at,notnull"`
	UpdatedAt     int64  `bun:"updated_at,notnull"`
}

// NewDiscordIdentity is the insert shape for discord_identities.
type NewDiscordIdentity struct {
	bun.BaseModel `bun:"table:discord_identities,alias:di"`

	Game          Game   `bun:",notnull"`
	DiscordUserID string `bun:"discord_user_id,notnull"`
	PlayerID      int32  `bun:"player_id,notnull"`
	CreatedAt     int64  `bun:"created_at,notnull"`
	UpdatedAt     int64  `bun:"updated_at,notnull"`
}

// PlayerStatSnapshot maps to table player_stat_snapshots.
type PlayerStatSnapshot struct {
	bun.BaseModel `bun:"table:player_stat_snapshots,alias:pss"`

	ID                 int32           `bun:",pk,autoincrement"`
	PlayerID           int32           `bun:"player_id,notnull"`
	Game               Game            `bun:",notnull"`
	FetchedAt          int64           `bun:"fetched_at,notnull"`
	Source             string          `bun:",notnull"`
	CacheVersion       int32           `bun:"cache_version,notnull"`
	CurrentRank        *string         `bun:"current_rank"`
	RankPoints         int32           `bun:"rank_points,notnull"`
	Matches            int32           `bun:",notnull"`
	Wins               int32           `bun:",notnull"`
	Losses             int32           `bun:",notnull"`
	Kills              int32           `bun:",notnull"`
	Deaths             int32           `bun:",notnull"`
	Assists            int32           `bun:",notnull"`
	Headshots          int32           `bun:",notnull"`
	KDRatio            float64         `bun:"kd_ratio,notnull"`
	HeadshotPercentage float64         `bun:"headshot_percentage,notnull"`
	WinRate            float64         `bun:"win_rate,notnull"`
	Kost               float64         `bun:",notnull"`
	Metadata           json.RawMessage `bun:"metadata,type:jsonb"`
	PayloadJSON        string          `bun:"payload_json,notnull"`
	CreatedAt          int64           `bun:"created_at,notnull"`
}

// NewPlayerStatSnapshot is the insert shape for player_stat_snapshots.
type NewPlayerStatSnapshot struct {
	bun.BaseModel `bun:"table:player_stat_snapshots,alias:pss"`

	PlayerID           int32           `bun:"player_id,notnull"`
	Game               Game            `bun:",notnull"`
	FetchedAt          int64           `bun:"fetched_at,notnull"`
	Source             string          `bun:",notnull"`
	CacheVersion       int32           `bun:"cache_version,notnull"`
	CurrentRank        *string         `bun:"current_rank"`
	RankPoints         int32           `bun:"rank_points,notnull"`
	Matches            int32           `bun:",notnull"`
	Wins               int32           `bun:",notnull"`
	Losses             int32           `bun:",notnull"`
	Kills              int32           `bun:",notnull"`
	Deaths             int32           `bun:",notnull"`
	Assists            int32           `bun:",notnull"`
	Headshots          int32           `bun:",notnull"`
	KDRatio            float64         `bun:"kd_ratio,notnull"`
	HeadshotPercentage float64         `bun:"headshot_percentage,notnull"`
	WinRate            float64         `bun:"win_rate,notnull"`
	Kost               float64         `bun:",notnull"`
	Metadata           json.RawMessage `bun:"metadata,type:jsonb"`
	PayloadJSON        string          `bun:"payload_json,notnull"`
	CreatedAt          int64           `bun:"created_at,notnull"`
}

// ExternalMatchHistoryEntry maps to table external_match_history.
type ExternalMatchHistoryEntry struct {
	bun.BaseModel `bun:"table:external_match_history,alias:emh"`

	ID              int32           `bun:",pk,autoincrement"`
	PlayerID        int32           `bun:"player_id,notnull"`
	Game            Game            `bun:",notnull"`
	ExternalMatchID string          `bun:"external_match_id,notnull"`
	PlayedAt        int64           `bun:"played_at,notnull"`
	FetchedAt       int64           `bun:"fetched_at,notnull"`
	Metadata        json.RawMessage `bun:"metadata,type:jsonb"`
	CreatedAt       int64           `bun:"created_at,notnull"`
}

// NewExternalMatchHistoryEntry is the insert shape for external_match_history.
type NewExternalMatchHistoryEntry struct {
	bun.BaseModel `bun:"table:external_match_history,alias:emh"`

	PlayerID        int32           `bun:"player_id,notnull"`
	Game            Game            `bun:",notnull"`
	ExternalMatchID string          `bun:"external_match_id,notnull"`
	PlayedAt        int64           `bun:"played_at,notnull"`
	FetchedAt       int64           `bun:"fetched_at,notnull"`
	Metadata        json.RawMessage `bun:"metadata,type:jsonb"`
	CreatedAt       int64           `bun:"created_at,notnull"`
}

// UserSettings maps to table user_settings.
type UserSettings struct {
	bun.BaseModel `bun:"table:user_settings,alias:us"`

	DiscordUserID      string   `bun:"discord_user_id,pk,notnull"`
	Language           Language `bun:",notnull"`
	CreatedAt          int64    `bun:"created_at,notnull"`
	UpdatedAt          int64    `bun:"updated_at,notnull"`
	MatchmakingEnabled bool     `bun:"matchmaking_enabled,notnull"`
	TermsAcceptedAtMs  int64    `bun:"terms_accepted_at_ms,notnull"`
	ProfilePublic      bool     `bun:"profile_public,notnull"`
	Timezone           string   `bun:",notnull"`
}

// NewUserSettings is the insert shape for user_settings.
type NewUserSettings struct {
	bun.BaseModel `bun:"table:user_settings,alias:us"`

	DiscordUserID      string   `bun:"discord_user_id,notnull"`
	Language           Language `bun:",notnull"`
	CreatedAt          int64    `bun:"created_at,notnull"`
	UpdatedAt          int64    `bun:"updated_at,notnull"`
	MatchmakingEnabled bool     `bun:"matchmaking_enabled,notnull"`
	TermsAcceptedAtMs  int64    `bun:"terms_accepted_at_ms,notnull"`
	ProfilePublic      bool     `bun:"profile_public,notnull"`
	Timezone           string   `bun:",notnull"`
}

// AccountDeletionCooldown maps to table account_deletion_cooldowns.
type AccountDeletionCooldown struct {
	bun.BaseModel `bun:"table:account_deletion_cooldowns,alias:adc"`

	DiscordUserIDHash string `bun:"discord_user_id_hash,pk,notnull"`
	DeletedAt         int64  `bun:"deleted_at,notnull"`
	CooldownUntil     int64  `bun:"cooldown_until,notnull"`
}

// NewAccountDeletionCooldown is the insert shape for account_deletion_cooldowns.
type NewAccountDeletionCooldown struct {
	bun.BaseModel `bun:"table:account_deletion_cooldowns,alias:adc"`

	DiscordUserIDHash string `bun:"discord_user_id_hash,notnull"`
	DeletedAt         int64  `bun:"deleted_at,notnull"`
	CooldownUntil     int64  `bun:"cooldown_until,notnull"`
}

// GuildMembership maps to table guild_memberships.
type GuildMembership struct {
	bun.BaseModel `bun:"table:guild_memberships,alias:gm"`

	ID                int32   `bun:",pk,autoincrement"`
	Game              Game    `bun:",notnull"`
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

// NewGuildMembership is the insert shape for guild_memberships.
type NewGuildMembership struct {
	bun.BaseModel `bun:"table:guild_memberships,alias:gm"`

	Game              Game    `bun:",notnull"`
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

// GuildMatchQuota maps to table guild_match_quotas.
type GuildMatchQuota struct {
	bun.BaseModel `bun:"table:guild_match_quotas,alias:gq"`

	ID                     int32  `bun:",pk,autoincrement"`
	Game                   Game   `bun:",notnull"`
	GuildID                string `bun:"guild_id,notnull"`
	DailyMatchLimit        int32  `bun:"daily_match_limit,notnull"`
	UpdatedByDiscordUserID string `bun:"updated_by_discord_user_id,notnull"`
	CreatedAt              int64  `bun:"created_at,notnull"`
	UpdatedAt              int64  `bun:"updated_at,notnull"`
}

// NewGuildMatchQuota is the insert shape for guild_match_quotas.
type NewGuildMatchQuota struct {
	bun.BaseModel `bun:"table:guild_match_quotas,alias:gq"`

	Game                   Game   `bun:",notnull"`
	GuildID                string `bun:"guild_id,notnull"`
	DailyMatchLimit        int32  `bun:"daily_match_limit,notnull"`
	UpdatedByDiscordUserID string `bun:"updated_by_discord_user_id,notnull"`
	CreatedAt              int64  `bun:"created_at,notnull"`
	UpdatedAt              int64  `bun:"updated_at,notnull"`
}

// GuildSettings maps to table guild_settings.
type GuildSettings struct {
	bun.BaseModel `bun:"table:guild_settings,alias:gs"`

	GuildID                string   `bun:"guild_id,pk,notnull"`
	Game                   Game     `bun:",pk,notnull"`
	DefaultTeamFormat      *string  `bun:"default_team_format"`
	AutoBalance            bool     `bun:"auto_balance,notnull"`
	CrossGuildMatchmaking  bool     `bun:"cross_guild_matchmaking,notnull"`
	UpdatedAt              int64    `bun:"updated_at,notnull"`
	UpdatedByDiscordUserID string   `bun:"updated_by_discord_user_id,notnull"`
	DefaultLanguage        Language `bun:"default_language,notnull"`
	MatchmakingEnabled     bool     `bun:"matchmaking_enabled,notnull"`
}

// NewGuildSettings is the insert shape for guild_settings.
type NewGuildSettings struct {
	bun.BaseModel `bun:"table:guild_settings,alias:gs"`

	GuildID                string   `bun:"guild_id,notnull"`
	Game                   Game     `bun:",notnull"`
	DefaultTeamFormat      *string  `bun:"default_team_format"`
	AutoBalance            bool     `bun:"auto_balance,notnull"`
	CrossGuildMatchmaking  bool     `bun:"cross_guild_matchmaking,notnull"`
	UpdatedAt              int64    `bun:"updated_at,notnull"`
	UpdatedByDiscordUserID string   `bun:"updated_by_discord_user_id,notnull"`
	DefaultLanguage        Language `bun:"default_language,notnull"`
	MatchmakingEnabled     bool     `bun:"matchmaking_enabled,notnull"`
}

// GuildMatchmakingRules maps to table guild_matchmaking_rules.
type GuildMatchmakingRules struct {
	bun.BaseModel `bun:"table:guild_matchmaking_rules,alias:gmr"`

	GuildID         string   `bun:"guild_id,pk,notnull"`
	Game            Game     `bun:",pk,notnull"`
	MinElo          *int32   `bun:"min_elo"`
	MaxElo          *int32   `bun:"max_elo"`
	Platforms       []string `bun:"platforms,array"`
	RequireVerified bool     `bun:"require_verified,notnull"`
	MaxEloGap       int32    `bun:"max_elo_gap,notnull"`
	UpdatedAt       int64    `bun:"updated_at,notnull"`
}

// NewGuildMatchmakingRules is the insert shape for guild_matchmaking_rules.
type NewGuildMatchmakingRules struct {
	bun.BaseModel `bun:"table:guild_matchmaking_rules,alias:gmr"`

	GuildID         string   `bun:"guild_id,notnull"`
	Game            Game     `bun:",notnull"`
	MinElo          *int32   `bun:"min_elo"`
	MaxElo          *int32   `bun:"max_elo"`
	Platforms       []string `bun:"platforms,array"`
	RequireVerified bool     `bun:"require_verified,notnull"`
	MaxEloGap       int32    `bun:"max_elo_gap,notnull"`
	UpdatedAt       int64    `bun:"updated_at,notnull"`
}

// GuildNotificationSettings maps to table guild_notification_settings.
type GuildNotificationSettings struct {
	bun.BaseModel `bun:"table:guild_notification_settings,alias:gns"`

	GuildID                        string  `bun:"guild_id,pk,notnull"`
	Game                           Game    `bun:",pk,notnull"`
	MatchResultsChannel            *string `bun:"match_results_channel"`
	TournamentAnnouncementsChannel *string `bun:"tournament_announcements_channel"`
	LeaderboardUpdatesEnabled      bool    `bun:"leaderboard_updates_enabled,notnull"`
	UpdatedAt                      int64   `bun:"updated_at,notnull"`
}

// NewGuildNotificationSettings is the insert shape for guild_notification_settings.
type NewGuildNotificationSettings struct {
	bun.BaseModel `bun:"table:guild_notification_settings,alias:gns"`

	GuildID                        string  `bun:"guild_id,notnull"`
	Game                           Game    `bun:",notnull"`
	MatchResultsChannel            *string `bun:"match_results_channel"`
	TournamentAnnouncementsChannel *string `bun:"tournament_announcements_channel"`
	LeaderboardUpdatesEnabled      bool    `bun:"leaderboard_updates_enabled,notnull"`
	UpdatedAt                      int64   `bun:"updated_at,notnull"`
}

// TournamentSchedule maps to table tournament_schedules.
type TournamentSchedule struct {
	bun.BaseModel `bun:"table:tournament_schedules,alias:ts"`

	ID             int32   `bun:",pk,autoincrement"`
	Game           Game    `bun:",notnull"`
	GuildID        string  `bun:"guild_id,notnull"`
	Name           string  `bun:",notnull"`
	Format         string  `bun:",notnull"`
	TeamCap        int32   `bun:"team_cap,notnull"`
	CronExpression string  `bun:"cron_expression,notnull"`
	ChannelID      string  `bun:"channel_id,notnull"`
	RoleID         *string `bun:"role_id"`
	Enabled        bool    `bun:",notnull"`
	CreatedAt      int64   `bun:"created_at,notnull"`
	UpdatedAt      int64   `bun:"updated_at,notnull"`
}

// MatchRow maps to table matches.
type MatchRow struct {
	bun.BaseModel `bun:"table:matches,alias:m"`

	ID                           int32     `bun:",pk,autoincrement"`
	Game                         Game      `bun:",notnull"`
	GuildID                      string    `bun:"guild_id,notnull"`
	ChannelID                    string    `bun:"channel_id,notnull"`
	MessageID                    string    `bun:"message_id,notnull"`
	CreatedByDiscordUserID       string    `bun:"created_by_discord_user_id,notnull"`
	Status                       string    `bun:",notnull"`
	MatchType                    string    `bun:"match_type,notnull"`
	OpponentGuildID              *string   `bun:"opponent_guild_id"`
	OpponentChannelID            *string   `bun:"opponent_channel_id"`
	OpponentMessageID            *string   `bun:"opponent_message_id"`
	OpponentCaptainDiscordUserID *string   `bun:"opponent_captain_discord_user_id"`
	TeamASeedTotal               float64   `bun:"team_a_seed_total,notnull"`
	TeamBSeedTotal               float64   `bun:"team_b_seed_total,notnull"`
	SeedGap                      float64   `bun:"seed_gap,notnull"`
	WinningTeam                  *string   `bun:"winning_team"`
	ResolutionType               string    `bun:"resolution_type,notnull"`
	TeamABalanceTotal            float64   `bun:"team_a_balance_total,notnull"`
	TeamBBalanceTotal            float64   `bun:"team_b_balance_total,notnull"`
	BalanceGap                   float64   `bun:"balance_gap,notnull"`
	CreatedAt                    int64     `bun:"created_at,notnull"`
	UpdatedAt                    int64     `bun:"updated_at,notnull"`
	PublicUUID                   uuid.UUID `bun:"public_uuid,type:uuid,notnull"`
}

// NewMatch is the insert shape for matches.
type NewMatch struct {
	bun.BaseModel `bun:"table:matches,alias:m"`

	Game                         Game       `bun:",notnull"`
	GuildID                      string     `bun:"guild_id,notnull"`
	ChannelID                    string     `bun:"channel_id,notnull"`
	MessageID                    string     `bun:"message_id,notnull"`
	CreatedByDiscordUserID       string     `bun:"created_by_discord_user_id,notnull"`
	Status                       string     `bun:",notnull"`
	MatchType                    string     `bun:"match_type,notnull"`
	OpponentGuildID              *string    `bun:"opponent_guild_id"`
	OpponentChannelID            *string    `bun:"opponent_channel_id"`
	OpponentMessageID            *string    `bun:"opponent_message_id"`
	OpponentCaptainDiscordUserID *string    `bun:"opponent_captain_discord_user_id"`
	TeamASeedTotal               float64    `bun:"team_a_seed_total,notnull"`
	TeamBSeedTotal               float64    `bun:"team_b_seed_total,notnull"`
	SeedGap                      float64    `bun:"seed_gap,notnull"`
	WinningTeam                  *string    `bun:"winning_team"`
	ResolutionType               string     `bun:"resolution_type,notnull"`
	TeamABalanceTotal            float64    `bun:"team_a_balance_total,notnull"`
	TeamBBalanceTotal            float64    `bun:"team_b_balance_total,notnull"`
	BalanceGap                   float64    `bun:"balance_gap,notnull"`
	CreatedAt                    int64      `bun:"created_at,notnull"`
	UpdatedAt                    int64      `bun:"updated_at,notnull"`
	PublicUUID                   *uuid.UUID `bun:"public_uuid,type:uuid"`
}

// MatchParticipant maps to table match_participants.
type MatchParticipant struct {
	bun.BaseModel `bun:"table:match_participants,alias:mp"`

	ID                     int32   `bun:",pk,autoincrement"`
	Game                   Game    `bun:",notnull"`
	MatchID                int32   `bun:"match_id,notnull"`
	DiscordUserID          string  `bun:"discord_user_id,notnull"`
	PlayerID               int32   `bun:"player_id,notnull"`
	Team                   string  `bun:",notnull"`
	Slot                   int32   `bun:",notnull"`
	SeedRankPoints         int32   `bun:"seed_rank_points,notnull"`
	SeedKDRatio            float64 `bun:"seed_kd_ratio,notnull"`
	SeedKost               float64 `bun:"seed_kost,notnull"`
	SeedKPR                float64 `bun:"seed_kpr,notnull"`
	SeedHeadshotPercentage float64 `bun:"seed_headshot_percentage,notnull"`
	SeedScore              float64 `bun:"seed_score,notnull"`
	BalanceRating          float64 `bun:"balance_rating,notnull"`
	Kills                  *int32  `bun:"kills"`
	Deaths                 *int32  `bun:"deaths"`
	CreatedAt              int64   `bun:"created_at,notnull"`
	UpdatedAt              int64   `bun:"updated_at,notnull"`
}

// NewMatchParticipant is the insert shape for match_participants.
type NewMatchParticipant struct {
	bun.BaseModel `bun:"table:match_participants,alias:mp"`

	Game                   Game    `bun:",notnull"`
	MatchID                int32   `bun:"match_id,notnull"`
	DiscordUserID          string  `bun:"discord_user_id,notnull"`
	PlayerID               int32   `bun:"player_id,notnull"`
	Team                   string  `bun:",notnull"`
	Slot                   int32   `bun:",notnull"`
	SeedRankPoints         int32   `bun:"seed_rank_points,notnull"`
	SeedKDRatio            float64 `bun:"seed_kd_ratio,notnull"`
	SeedKost               float64 `bun:"seed_kost,notnull"`
	SeedKPR                float64 `bun:"seed_kpr,notnull"`
	SeedHeadshotPercentage float64 `bun:"seed_headshot_percentage,notnull"`
	SeedScore              float64 `bun:"seed_score,notnull"`
	BalanceRating          float64 `bun:"balance_rating,notnull"`
	Kills                  *int32  `bun:"kills"`
	Deaths                 *int32  `bun:"deaths"`
	CreatedAt              int64   `bun:"created_at,notnull"`
	UpdatedAt              int64   `bun:"updated_at,notnull"`
}

// MatchParticipantWithUsername is a join projection (not a table).
type MatchParticipantWithUsername struct {
	ID                     int32   `bun:"id"`
	Game                   Game    `bun:"game"`
	MatchID                int32   `bun:"match_id"`
	DiscordUserID          string  `bun:"discord_user_id"`
	PlayerID               int32   `bun:"player_id"`
	Team                   string  `bun:"team"`
	Slot                   int32   `bun:"slot"`
	SeedRankPoints         int32   `bun:"seed_rank_points"`
	SeedKDRatio            float64 `bun:"seed_kd_ratio"`
	SeedKost               float64 `bun:"seed_kost"`
	SeedKPR                float64 `bun:"seed_kpr"`
	SeedHeadshotPercentage float64 `bun:"seed_headshot_percentage"`
	SeedScore              float64 `bun:"seed_score"`
	BalanceRating          float64 `bun:"balance_rating"`
	Kills                  *int32  `bun:"kills"`
	Deaths                 *int32  `bun:"deaths"`
	CreatedAt              int64   `bun:"created_at"`
	UpdatedAt              int64   `bun:"updated_at"`
	Username               *string `bun:"username"`
	Platform               *string `bun:"platform"`
}

// MatchmakingQueue maps to table matchmaking_queues.
type MatchmakingQueue struct {
	bun.BaseModel `bun:"table:matchmaking_queues,alias:mq"`

	ID                   int32   `bun:",pk,autoincrement"`
	Game                 Game    `bun:",notnull"`
	GuildID              string  `bun:"guild_id,notnull"`
	ChannelID            string  `bun:"channel_id,notnull"`
	CaptainDiscordUserID string  `bun:"captain_discord_user_id,notnull"`
	Status               string  `bun:",notnull"`
	PlayerCount          int32   `bun:"player_count,notnull"`
	StackBalanceTotal    float64 `bun:"stack_balance_total,notnull"`
	StackBalanceAverage  float64 `bun:"stack_balance_average,notnull"`
	MatchedMatchID       *int32  `bun:"matched_match_id"`
	ExpiresAt            int64   `bun:"expires_at,notnull"`
	CreatedAt            int64   `bun:"created_at,notnull"`
	UpdatedAt            int64   `bun:"updated_at,notnull"`
	TeamSize             int32   `bun:"team_size,notnull"`
}

// NewMatchmakingQueue is the insert shape for matchmaking_queues.
type NewMatchmakingQueue struct {
	bun.BaseModel `bun:"table:matchmaking_queues,alias:mq"`

	Game                 Game    `bun:",notnull"`
	GuildID              string  `bun:"guild_id,notnull"`
	ChannelID            string  `bun:"channel_id,notnull"`
	CaptainDiscordUserID string  `bun:"captain_discord_user_id,notnull"`
	Status               string  `bun:",notnull"`
	PlayerCount          int32   `bun:"player_count,notnull"`
	StackBalanceTotal    float64 `bun:"stack_balance_total,notnull"`
	StackBalanceAverage  float64 `bun:"stack_balance_average,notnull"`
	MatchedMatchID       *int32  `bun:"matched_match_id"`
	ExpiresAt            int64   `bun:"expires_at,notnull"`
	CreatedAt            int64   `bun:"created_at,notnull"`
	UpdatedAt            int64   `bun:"updated_at,notnull"`
	TeamSize             int32   `bun:"team_size,notnull"`
}

// MatchmakingQueueParticipant maps to table matchmaking_queue_participants.
type MatchmakingQueueParticipant struct {
	bun.BaseModel `bun:"table:matchmaking_queue_participants,alias:mqp"`

	ID                     int32   `bun:",pk,autoincrement"`
	Game                   Game    `bun:",notnull"`
	QueueID                int32   `bun:"queue_id,notnull"`
	DiscordUserID          string  `bun:"discord_user_id,notnull"`
	PlayerID               int32   `bun:"player_id,notnull"`
	Slot                   int32   `bun:",notnull"`
	Username               string  `bun:",notnull"`
	Platform               string  `bun:",notnull"`
	BalanceRating          float64 `bun:"balance_rating,notnull"`
	SeedRankPoints         int32   `bun:"seed_rank_points,notnull"`
	SeedKDRatio            float64 `bun:"seed_kd_ratio,notnull"`
	SeedKost               float64 `bun:"seed_kost,notnull"`
	SeedKPR                float64 `bun:"seed_kpr,notnull"`
	SeedHeadshotPercentage float64 `bun:"seed_headshot_percentage,notnull"`
	SeedScore              float64 `bun:"seed_score,notnull"`
	CreatedAt              int64   `bun:"created_at,notnull"`
	UpdatedAt              int64   `bun:"updated_at,notnull"`
}

// NewMatchmakingQueueParticipant is the insert shape for matchmaking_queue_participants.
type NewMatchmakingQueueParticipant struct {
	bun.BaseModel `bun:"table:matchmaking_queue_participants,alias:mqp"`

	Game                   Game    `bun:",notnull"`
	QueueID                int32   `bun:"queue_id,notnull"`
	DiscordUserID          string  `bun:"discord_user_id,notnull"`
	PlayerID               int32   `bun:"player_id,notnull"`
	Slot                   int32   `bun:",notnull"`
	Username               string  `bun:",notnull"`
	Platform               string  `bun:",notnull"`
	BalanceRating          float64 `bun:"balance_rating,notnull"`
	SeedRankPoints         int32   `bun:"seed_rank_points,notnull"`
	SeedKDRatio            float64 `bun:"seed_kd_ratio,notnull"`
	SeedKost               float64 `bun:"seed_kost,notnull"`
	SeedKPR                float64 `bun:"seed_kpr,notnull"`
	SeedHeadshotPercentage float64 `bun:"seed_headshot_percentage,notnull"`
	SeedScore              float64 `bun:"seed_score,notnull"`
	CreatedAt              int64   `bun:"created_at,notnull"`
	UpdatedAt              int64   `bun:"updated_at,notnull"`
}

// Tournament maps to table tournaments.
type Tournament struct {
	bun.BaseModel `bun:"table:tournaments,alias:t"`

	ID                     int32   `bun:",pk,autoincrement"`
	Game                   Game    `bun:",notnull"`
	Name                   string  `bun:",notnull"`
	NameNormalized         string  `bun:"name_normalized,notnull"`
	Format                 string  `bun:",notnull"`
	TeamCap                int32   `bun:"team_cap,notnull"`
	Visibility             string  `bun:",notnull"`
	Status                 string  `bun:",notnull"`
	CreatedByGuildID       string  `bun:"created_by_guild_id,notnull"`
	CreatedByChannelID     string  `bun:"created_by_channel_id,notnull"`
	CreatedByDiscordUserID string  `bun:"created_by_discord_user_id,notnull"`
	HubMessageID           *string `bun:"hub_message_id"`
	FilledAt               *int64  `bun:"filled_at"`
	AutoStartAt            *int64  `bun:"auto_start_at"`
	StartedAt              *int64  `bun:"started_at"`
	CompletedAt            *int64  `bun:"completed_at"`
	WinnerEntryID          *int32  `bun:"winner_entry_id"`
	CreatedAt              int64   `bun:"created_at,notnull"`
	UpdatedAt              int64   `bun:"updated_at,notnull"`
}

// NewTournament is the insert shape for tournaments.
type NewTournament struct {
	bun.BaseModel `bun:"table:tournaments,alias:t"`

	Game                   Game    `bun:",notnull"`
	Name                   string  `bun:",notnull"`
	NameNormalized         string  `bun:"name_normalized,notnull"`
	Format                 string  `bun:",notnull"`
	TeamCap                int32   `bun:"team_cap,notnull"`
	Visibility             string  `bun:",notnull"`
	Status                 string  `bun:",notnull"`
	CreatedByGuildID       string  `bun:"created_by_guild_id,notnull"`
	CreatedByChannelID     string  `bun:"created_by_channel_id,notnull"`
	CreatedByDiscordUserID string  `bun:"created_by_discord_user_id,notnull"`
	HubMessageID           *string `bun:"hub_message_id"`
	FilledAt               *int64  `bun:"filled_at"`
	AutoStartAt            *int64  `bun:"auto_start_at"`
	StartedAt              *int64  `bun:"started_at"`
	CompletedAt            *int64  `bun:"completed_at"`
	WinnerEntryID          *int32  `bun:"winner_entry_id"`
	CreatedAt              int64   `bun:"created_at,notnull"`
	UpdatedAt              int64   `bun:"updated_at,notnull"`
}

// TournamentTeam maps to table tournament_teams.
type TournamentTeam struct {
	bun.BaseModel `bun:"table:tournament_teams,alias:tt"`

	ID                   int32   `bun:",pk,autoincrement"`
	Game                 Game    `bun:",notnull"`
	TournamentID         int32   `bun:"tournament_id,notnull"`
	GuildID              string  `bun:"guild_id,notnull"`
	ChannelID            string  `bun:"channel_id,notnull"`
	CaptainDiscordUserID string  `bun:"captain_discord_user_id,notnull"`
	TeamName             string  `bun:"team_name,notnull"`
	TeamNameNormalized   string  `bun:"team_name_normalized,notnull"`
	Status               string  `bun:",notnull"`
	SeedNumber           *int32  `bun:"seed_number"`
	StackBalanceTotal    float64 `bun:"stack_balance_total,notnull"`
	StackBalanceAverage  float64 `bun:"stack_balance_average,notnull"`
	JoinedAt             int64   `bun:"joined_at,notnull"`
	EliminatedAt         *int64  `bun:"eliminated_at"`
	CreatedAt            int64   `bun:"created_at,notnull"`
	UpdatedAt            int64   `bun:"updated_at,notnull"`
}

// SeedScore returns the team's average stack balance as the seeding
// signal. It satisfies tourney.Seeder so the bracket generation pipeline
// can sort teams in-place by skill without a separate wrapper type.
func (t TournamentTeam) SeedScore() float64 {
	return t.StackBalanceAverage
}

// NewTournamentTeam is the insert shape for tournament_teams.
type NewTournamentTeam struct {
	bun.BaseModel `bun:"table:tournament_teams,alias:tt"`

	Game                 Game    `bun:",notnull"`
	TournamentID         int32   `bun:"tournament_id,notnull"`
	GuildID              string  `bun:"guild_id,notnull"`
	ChannelID            string  `bun:"channel_id,notnull"`
	CaptainDiscordUserID string  `bun:"captain_discord_user_id,notnull"`
	TeamName             string  `bun:"team_name,notnull"`
	TeamNameNormalized   string  `bun:"team_name_normalized,notnull"`
	Status               string  `bun:",notnull"`
	SeedNumber           *int32  `bun:"seed_number"`
	StackBalanceTotal    float64 `bun:"stack_balance_total,notnull"`
	StackBalanceAverage  float64 `bun:"stack_balance_average,notnull"`
	JoinedAt             int64   `bun:"joined_at,notnull"`
	EliminatedAt         *int64  `bun:"eliminated_at"`
	CreatedAt            int64   `bun:"created_at,notnull"`
	UpdatedAt            int64   `bun:"updated_at,notnull"`
}

// TournamentTeamRoster maps to table tournament_team_rosters.
type TournamentTeamRoster struct {
	bun.BaseModel `bun:"table:tournament_team_rosters,alias:ttr"`

	ID                     int32   `bun:",pk,autoincrement"`
	Game                   Game    `bun:",notnull"`
	TournamentID           int32   `bun:"tournament_id,notnull"`
	TeamID                 int32   `bun:"team_id,notnull"`
	DiscordUserID          string  `bun:"discord_user_id,notnull"`
	PlayerID               int32   `bun:"player_id,notnull"`
	Slot                   int32   `bun:",notnull"`
	Username               string  `bun:",notnull"`
	Platform               string  `bun:",notnull"`
	BalanceRating          float64 `bun:"balance_rating,notnull"`
	SeedRankPoints         int32   `bun:"seed_rank_points,notnull"`
	SeedKDRatio            float64 `bun:"seed_kd_ratio,notnull"`
	SeedKost               float64 `bun:"seed_kost,notnull"`
	SeedKPR                float64 `bun:"seed_kpr,notnull"`
	SeedHeadshotPercentage float64 `bun:"seed_headshot_percentage,notnull"`
	SeedScore              float64 `bun:"seed_score,notnull"`
	CreatedAt              int64   `bun:"created_at,notnull"`
	UpdatedAt              int64   `bun:"updated_at,notnull"`
}

// NewTournamentTeamRoster is the insert shape for tournament_team_rosters.
type NewTournamentTeamRoster struct {
	bun.BaseModel `bun:"table:tournament_team_rosters,alias:ttr"`

	Game                   Game    `bun:",notnull"`
	TournamentID           int32   `bun:"tournament_id,notnull"`
	TeamID                 int32   `bun:"team_id,notnull"`
	DiscordUserID          string  `bun:"discord_user_id,notnull"`
	PlayerID               int32   `bun:"player_id,notnull"`
	Slot                   int32   `bun:",notnull"`
	Username               string  `bun:",notnull"`
	Platform               string  `bun:",notnull"`
	BalanceRating          float64 `bun:"balance_rating,notnull"`
	SeedRankPoints         int32   `bun:"seed_rank_points,notnull"`
	SeedKDRatio            float64 `bun:"seed_kd_ratio,notnull"`
	SeedKost               float64 `bun:"seed_kost,notnull"`
	SeedKPR                float64 `bun:"seed_kpr,notnull"`
	SeedHeadshotPercentage float64 `bun:"seed_headshot_percentage,notnull"`
	SeedScore              float64 `bun:"seed_score,notnull"`
	CreatedAt              int64   `bun:"created_at,notnull"`
	UpdatedAt              int64   `bun:"updated_at,notnull"`
}

// BracketMatch maps to table bracket_matches.
type BracketMatch struct {
	bun.BaseModel `bun:"table:bracket_matches,alias:bm"`

	ID              int32   `bun:",pk,autoincrement"`
	Game            Game    `bun:",notnull"`
	TournamentID    int32   `bun:"tournament_id,notnull"`
	Bracket         string  `bun:",notnull"`
	RoundNumber     int32   `bun:"round_number,notnull"`
	MatchNumber     int32   `bun:"match_number,notnull"`
	Status          string  `bun:",notnull"`
	TeamAID         *int32  `bun:"team_a_id"`
	TeamBID         *int32  `bun:"team_b_id"`
	WinnerTeamID    *int32  `bun:"winner_team_id"`
	LoserTeamID     *int32  `bun:"loser_team_id"`
	WinnerToMatchID *int32  `bun:"winner_to_match_id"`
	WinnerToSlot    *string `bun:"winner_to_slot"`
	LoserToMatchID  *int32  `bun:"loser_to_match_id"`
	LoserToSlot     *string `bun:"loser_to_slot"`
	CustomMatchID   *int32  `bun:"custom_match_id"`
	CreatedAt       int64   `bun:"created_at,notnull"`
	UpdatedAt       int64   `bun:"updated_at,notnull"`
}

// NewBracketMatch is the insert shape for bracket_matches.
type NewBracketMatch struct {
	bun.BaseModel `bun:"table:bracket_matches,alias:bm"`

	Game            Game    `bun:",notnull"`
	TournamentID    int32   `bun:"tournament_id,notnull"`
	Bracket         string  `bun:",notnull"`
	RoundNumber     int32   `bun:"round_number,notnull"`
	MatchNumber     int32   `bun:"match_number,notnull"`
	Status          string  `bun:",notnull"`
	TeamAID         *int32  `bun:"team_a_id"`
	TeamBID         *int32  `bun:"team_b_id"`
	WinnerTeamID    *int32  `bun:"winner_team_id"`
	LoserTeamID     *int32  `bun:"loser_team_id"`
	WinnerToMatchID *int32  `bun:"winner_to_match_id"`
	WinnerToSlot    *string `bun:"winner_to_slot"`
	LoserToMatchID  *int32  `bun:"loser_to_match_id"`
	LoserToSlot     *string `bun:"loser_to_slot"`
	CustomMatchID   *int32  `bun:"custom_match_id"`
	CreatedAt       int64   `bun:"created_at,notnull"`
	UpdatedAt       int64   `bun:"updated_at,notnull"`
}

// EpochMillis is a helper for converting wall-clock times to domain epoch millis.
func EpochMillis(t time.Time) int64 {
	return t.UnixMilli()
}
