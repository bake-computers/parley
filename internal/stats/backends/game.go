// Package backends registers per-game stats upstream providers.
// Ported from src/backends/mod.rs.
package backends

// Game is the set of games the backend registry can dispatch to, distinct from proto enums.
type Game int

const (
	GameR6 Game = iota
)

// String returns the stable game slug used in errors and cache keys.
func (g Game) String() string {
	switch g {
	case GameR6:
		return "r6"
	default:
		return "unknown"
	}
}
