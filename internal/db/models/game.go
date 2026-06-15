package models

import "fmt"

// Game mirrors the Postgres `games` enum.
type Game string

const (
	GameR6 Game = "r6"
)

func (g Game) String() string { return string(g) }

// ParseGame parses a game discriminator string.
func ParseGame(s string) (Game, error) {
	switch s {
	case "r6", "R6":
		return GameR6, nil
	default:
		return "", fmt.Errorf("unknown game: %s", s)
	}
}
