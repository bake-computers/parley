// Package apperr maps domain error codes to connect error codes and provides
// helpers for building connect errors with proto Error details.
package apperr

import (
	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
)

// Domain error codes matching the Rust handler conventions.
const (
	CodeInvalidArgument    = "InvalidArgument"
	CodeNotFound           = "NotFound"
	CodeAlreadyExists      = "AlreadyExists"
	CodeFailedPrecondition = "FailedPrecondition"
	CodePermissionDenied   = "PermissionDenied"
	CodeInternal           = "Internal"
)

// DomainCodeToConnect maps a domain error code string to the corresponding connect code.
func DomainCodeToConnect(code string) connect.Code {
	switch code {
	case CodeInvalidArgument:
		return connect.CodeInvalidArgument
	case CodeNotFound:
		return connect.CodeNotFound
	case CodeAlreadyExists:
		return connect.CodeAlreadyExists
	case CodeFailedPrecondition:
		return connect.CodeFailedPrecondition
	case CodePermissionDenied:
		return connect.CodePermissionDenied
	case CodeInternal:
		return connect.CodeInternal
	default:
		return connect.CodeInternal
	}
}

// New creates a *connect.Error with the given domain code and message.
// The proto Error detail is attached so clients can deserialize it.
func New(domainCode, message string) *connect.Error {
	detail := &commonv1.Error{
		Code:    domainCode,
		Message: message,
	}
	cerr := connect.NewError(DomainCodeToConnect(domainCode), NewDomainError(message))
	if d, err := connect.NewErrorDetail(detail); err == nil {
		cerr.AddDetail(d)
	}
	return cerr
}

// InvalidArgument is a shorthand for New(CodeInvalidArgument, msg).
func InvalidArgument(msg string) *connect.Error {
	return New(CodeInvalidArgument, msg)
}

// FailedPrecondition is a shorthand for New(CodeFailedPrecondition, msg).
func FailedPrecondition(msg string) *connect.Error {
	return New(CodeFailedPrecondition, msg)
}

// NotFound is a shorthand for New(CodeNotFound, msg).
func NotFound(msg string) *connect.Error {
	return New(CodeNotFound, msg)
}

// AlreadyExists is a shorthand for New(CodeAlreadyExists, msg).
func AlreadyExists(msg string) *connect.Error {
	return New(CodeAlreadyExists, msg)
}

// PermissionDenied is a shorthand for New(CodePermissionDenied, msg).
func PermissionDenied(msg string) *connect.Error {
	return New(CodePermissionDenied, msg)
}

// Internal is a shorthand for New(CodeInternal, msg).
func Internal(msg string) *connect.Error {
	return New(CodeInternal, msg)
}

// DomainError is a minimal error type carrying the domain message.
// connect.NewError requires an error, so this wraps the message.
type DomainError struct {
	msg string
}

func (e *DomainError) Error() string { return e.msg }

// NewDomainError returns an error with the given message.
func NewDomainError(msg string) error {
	return &DomainError{msg: msg}
}

// ExtractProtoError pulls the proto Error detail from a *connect.Error, if present.
// Returns nil when the detail is absent or unrecognised.
func ExtractProtoError(cerr *connect.Error) *commonv1.Error {
	for _, d := range cerr.Details() {
		val, err := d.Value()
		if err != nil {
			continue
		}
		if e, ok := val.(*commonv1.Error); ok {
			return e
		}
	}
	return nil
}

// Ensure DomainError satisfies the error interface at compile time.
var _ error = (*DomainError)(nil)
