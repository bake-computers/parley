// Package tourney implements pure tournament domain logic: format parsing,
// seeding, and bracket topology generation. It mirrors src/tourney/*.rs in
// the Rust engine-service and contains no I/O dependencies.
package tourney

import (
	"strconv"
	"strings"
)

// Tournament format identifiers returned by ParseTournamentFormat.
const (
	FormatSingleElimination = "single_elimination"
	FormatDoubleElimination = "double_elimination"
)

// DefaultTeamSize is returned by parseTeamSize when the format string has no
// "XvX" marker, matching parse_team_size in src/matchmaking/mod.rs.
const DefaultTeamSize = 5

// ParseTournamentFormat extracts (format, teamSize) from a human-readable
// format string such as "5v5 single elimination" or "3v3 double".
//
// Recognition rules match parse_tournament_format in src/tourney/mod.rs:
//   - if the lowercased string contains "double", return double_elimination
//   - else if it contains "single", return single_elimination
//   - else default to single_elimination
//
// Team size is extracted from the original (un-trimmed) string via the
// leading number before a "v" — e.g. "5v5" → 5, "3v3" → 3. Defaults to 5.
func ParseTournamentFormat(format string) (string, int) {
	trimmed := strings.ToLower(strings.TrimSpace(format))
	if strings.Contains(trimmed, "double") {
		return FormatDoubleElimination, parseTeamSize(format)
	}
	if strings.Contains(trimmed, "single") {
		return FormatSingleElimination, parseTeamSize(format)
	}
	return FormatSingleElimination, parseTeamSize(format)
}

// NormalizeTournamentName returns a stable lookup key for a tournament name:
// trimmed and lowercased.
func NormalizeTournamentName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// parseTeamSize extracts the team size from a "XvX" prefix. Falls back to
// DefaultTeamSize when no valid leading number is present. Mirrors
// parse_team_size in src/matchmaking/mod.rs.
func parseTeamSize(format string) int {
	trimmed := strings.ToLower(strings.TrimSpace(format))
	head, _, ok := strings.Cut(trimmed, "v")
	if !ok {
		return DefaultTeamSize
	}
	n, err := strconv.Atoi(strings.TrimSpace(head))
	if err != nil || n <= 0 {
		return DefaultTeamSize
	}
	return n
}
