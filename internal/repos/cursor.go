package repos

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
)

// CursorError is returned when an opaque pagination cursor cannot be decoded.
type CursorError struct {
	Stage string
	Cause error
}

func (e *CursorError) Error() string {
	return fmt.Sprintf("cursor %s: %v", e.Stage, e.Cause)
}

func (e *CursorError) Unwrap() error {
	return e.Cause
}

type cursorPayload struct {
	CreatedAt int64 `json:"created_at"`
	ID        int32 `json:"id"`
}

// EncodeCursor builds a URL-safe base64 keyset cursor from (created_at, id).
func EncodeCursor(createdAt int64, id int32) (string, error) {
	payload := cursorPayload{CreatedAt: createdAt, ID: id}
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("cursor payload marshal: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(jsonBytes), nil
}

// DecodeCursor parses a cursor string. Empty input yields (nil, nil).
func DecodeCursor(s string) (*cursorPayload, error) {
	if s == "" {
		return nil, nil
	}
	bytes, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, &CursorError{Stage: "base64 decode", Cause: err}
	}
	var payload cursorPayload
	if err := json.Unmarshal(bytes, &payload); err != nil {
		return nil, &CursorError{Stage: "json parse", Cause: err}
	}
	return &payload, nil
}

// CursorTuple returns (created_at, id) for repo pagination, or nil if absent.
func CursorTuple(s string) (createdAt int64, id int32, ok bool, err error) {
	p, err := DecodeCursor(s)
	if err != nil {
		return 0, 0, false, err
	}
	if p == nil {
		return 0, 0, false, nil
	}
	return p.CreatedAt, p.ID, true, nil
}

// IsCursorError reports whether err is a cursor decode failure.
func IsCursorError(err error) bool {
	var ce *CursorError
	return errors.As(err, &ce)
}
