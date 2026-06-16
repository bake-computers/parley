// Package migrations holds SQL migration files and an embedded filesystem for the Go engine.
package migrations

import "embed"

// FS contains Diesel-style folders: YYYY-MM-DD-HHMMSS_name/up.sql and down.sql.
//
//go:embed all:*
var FS embed.FS
