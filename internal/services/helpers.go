package services

import (
	"fmt"
	"time"

	commonv1 "github.com/bake-computers/parley/gen/parley/common/v1"
	"github.com/bake-computers/parley/internal/apperr"
	"github.com/bake-computers/parley/internal/models"
)

func NowMS() int64 {
	return time.Now().UTC().UnixMilli()
}

func protoGameToDB(g commonv1.Game) (models.Game, bool) {
	switch g {
	case commonv1.Game_GAME_R6:
		return models.GameR6, true
	default:
		return "", false
	}
}

func protoGameToModel(g commonv1.Game) (models.Game, error) {
	db, ok := protoGameToDB(g)
	if !ok {
		return "", fmt.Errorf("game must be specified")
	}
	return db, nil
}

func dbGameToProto(g models.Game) commonv1.Game {
	switch g {
	case models.GameR6:
		return commonv1.Game_GAME_R6
	default:
		return commonv1.Game_GAME_UNSPECIFIED
	}
}

type ServiceError struct {
	Code string
	Msg  string
}

func (e *ServiceError) Error() string {
	return e.Code + ": " + e.Msg
}

func (e *ServiceError) ToConnectError() error {
	return apperr.NewDomainError(e.Msg)
}
