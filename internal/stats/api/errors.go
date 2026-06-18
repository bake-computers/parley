package api

import "fmt"

// ErrorKind classifies API failures.
type ErrorKind int

const (
	ErrNetwork ErrorKind = iota
	ErrHTTP
	ErrAuth
	ErrNotFound
	ErrParse
	ErrProfileNotFound
)

// Error is returned by the stats.cc API client.
type Error struct {
	Kind      ErrorKind
	Status    int
	Message   string
	Retryable bool
}

func (k ErrorKind) String() string {
	switch k {
	case ErrNetwork:
		return "network"
	case ErrHTTP:
		return "http"
	case ErrAuth:
		return "auth"
	case ErrNotFound:
		return "not_found"
	case ErrParse:
		return "parse"
	case ErrProfileNotFound:
		return "profile_not_found"
	default:
		return "unknown"
	}
}

func (e *Error) Error() string {
	return fmt.Sprintf("stats.cc api %s (status=%d): %s", e.Kind.String(), e.Status, e.Message)
}

// ShouldFallback reports whether the fetch layer should try the HTML scraper.
func (e *Error) ShouldFallback() bool {
	return e.Retryable || e.Kind == ErrAuth || e.Kind == ErrNetwork || e.Kind == ErrHTTP || e.Kind == ErrParse
}
