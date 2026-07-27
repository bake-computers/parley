package handlers

import (
	"connectrpc.com/connect"
	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	"github.com/bake-computers/parley/internal/apperr"
)

func errProto(code, msg string) *commonv1.Error {
	return &commonv1.Error{Code: code, Message: msg}
}

func mapErr(err error) error {
	if cerr, ok := err.(*connect.Error); ok {
		return cerr
	}
	return apperr.Internal(err.Error())
}
