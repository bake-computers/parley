package services

import (
	"fmt"
	"time"

	commonv1 "github.com/parley-bot/parley/gen/parley/common/v1"
	"github.com/parley-bot/parley/internal/apperr"
	"github.com/parley-bot/parley/internal/models"
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

func protoLangToModel(l commonv1.Language) models.Language {
	switch l {
	case commonv1.Language_LANGUAGE_DE:
		return models.LanguageDe
	default:
		return models.LanguageEn
	}
}

func protoLangToDB(l commonv1.Language) models.Language {
	return protoLangToModel(l)
}

func modelLangToProto(l models.Language) commonv1.Language {
	switch l {
	case models.LanguageDe:
		return commonv1.Language_LANGUAGE_DE
	default:
		return commonv1.Language_LANGUAGE_EN
	}
}

func dbLangToProto(l models.Language) commonv1.Language {
	return modelLangToProto(l)
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
