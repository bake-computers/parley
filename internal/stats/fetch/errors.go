// Package fetch provides stats.cc HTTP client types and errors.
// Ported from src/fetch.rs.
package fetch

import (
	"context"
	"fmt"

	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// StatsPlatform is the canonical platform value for stats.cc queries.
type StatsPlatform int

const (
	StatsPlatformAuto StatsPlatform = iota
	StatsPlatformPC
	StatsPlatformXbox
	StatsPlatformPlaystation
)

// AsQuery returns the query parameter value for the platform, or empty string for Auto.
func (p StatsPlatform) AsQuery() string {
	switch p {
	case StatsPlatformPC:
		return "pc"
	case StatsPlatformXbox:
		return "xbox"
	case StatsPlatformPlaystation:
		return "playstation"
	default:
		return ""
	}
}

// String returns the wire/query token for the platform.
func (p StatsPlatform) String() string {
	switch p {
	case StatsPlatformAuto:
		return "auto"
	case StatsPlatformPC:
		return "pc"
	case StatsPlatformXbox:
		return "xbox"
	case StatsPlatformPlaystation:
		return "playstation"
	default:
		return "auto"
	}
}

// StatsFetchErrorKind classifies upstream fetch failures.
type StatsFetchErrorKind int

const (
	StatsFetchErrorNetwork StatsFetchErrorKind = iota
	StatsFetchErrorHTTPStatus
	StatsFetchErrorProfileNotFound
	StatsFetchErrorInvalidProfile
	StatsFetchErrorInvalidPayload
	StatsFetchErrorSeasonNotFound
	StatsFetchErrorGcUnavailable
)

func (k StatsFetchErrorKind) String() string {
	switch k {
	case StatsFetchErrorNetwork:
		return "Network"
	case StatsFetchErrorHTTPStatus:
		return "HttpStatus"
	case StatsFetchErrorProfileNotFound:
		return "ProfileNotFound"
	case StatsFetchErrorInvalidProfile:
		return "InvalidProfile"
	case StatsFetchErrorInvalidPayload:
		return "InvalidPayload"
	case StatsFetchErrorSeasonNotFound:
		return "SeasonNotFound"
	case StatsFetchErrorGcUnavailable:
		return "GcUnavailable"
	default:
		return "Unknown"
	}
}

// StatsFetchError is the structured error returned by stats fetch paths.
type StatsFetchError struct {
	Kind             StatsFetchErrorKind
	Message          string
	Retryable        bool
	Status           *uint16
	RequestedSeason  string
	AvailableSeasons []scrape.SeasonCatalogEntry
}

func (e *StatsFetchError) Error() string {
	if e == nil {
		return "<nil>"
	}
	return fmt.Sprintf("%s: %s", e.Kind, e.Message)
}

// NewStatsFetchError builds an error without optional season metadata.
func NewStatsFetchError(kind StatsFetchErrorKind, message string, retryable bool) *StatsFetchError {
	return &StatsFetchError{
		Kind:      kind,
		Message:   message,
		Retryable: retryable,
	}
}

// Client fetches scraped stats from stats.cc (Nuxt HTML path).
type Client interface {
	FetchStats(ctx context.Context, username string, platform StatsPlatform, season *string) (scrape.ScrapedStats, error)
	FetchStatsCollection(ctx context.Context, username string, platform StatsPlatform) (scrape.ScrapedStatsCollection, error)
}
