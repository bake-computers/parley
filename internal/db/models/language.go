package models

import "fmt"

// Language mirrors the Postgres `languages` enum.
type Language string

const (
	LanguageEn Language = "en"
	LanguageDe Language = "de"
)

func (l Language) String() string { return string(l) }

// ParseLanguage parses a language code.
func ParseLanguage(s string) (Language, error) {
	switch s {
	case "en", "EN":
		return LanguageEn, nil
	case "de", "DE":
		return LanguageDe, nil
	default:
		return "", fmt.Errorf("unknown language: %s", s)
	}
}
