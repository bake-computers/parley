package models

import "github.com/uptrace/bun"

// Player is a row in `players` (subset used for guild roster joins).
type Player struct {
	bun.BaseModel `bun:"table:players,alias:p"`

	ID                 int32  `bun:"id,pk,autoincrement"`
	Game               Game   `bun:"game,notnull"`
	Username           string `bun:"username,notnull"`
	UsernameNormalized string `bun:"username_normalized,notnull"`
	Platform           string `bun:"platform,notnull"`
}
