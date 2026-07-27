package tourney

import (
	"context"
	"time"

	"github.com/bake-computers/parley/internal/models"
	"github.com/uptrace/bun"
)

// BracketPersistenceStatus values mirror the bracket_matches.status enum.
const (
	BracketPersistStatusPending = "pending"
	BracketPersistStatusReady   = "ready"
)

// SeedAndActivateTeams sorts teams in-place by descending
// StackBalanceAverage (best first), then writes the seed_number and active
// status back to the database for every team. Mirrors seed_and_activate_teams
// in src/tourney/bracket.rs.
func SeedAndActivateTeams(
	ctx context.Context,
	db *bun.DB,
	teams []models.TournamentTeam,
) error {
	SeedTeams(teams)
	now := time.Now().UTC().UnixMilli()
	return db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		for i := range teams {
			team := teams[i]
			seed := int32(i + 1)
			_, err := tx.NewUpdate().
				Model((*models.TournamentTeam)(nil)).
				Set("seed_number = ?", seed).
				Set("status = ?", "active").
				Set("updated_at = ?", now).
				Where("id = ?", team.ID).
				Exec(ctx)
			if err != nil {
				return err
			}
			if team.SeedNumber != nil {
				*team.SeedNumber = seed
			} else {
				s := seed
				team.SeedNumber = &s
			}
			team.Status = "active"
		}
		return nil
	})
}

// PersistBracket inserts every BracketDraft as a bracket_matches row in one
// transaction. Round 1 matches with both team slots filled are stored as
// "ready"; everything else is "pending". After inserts, the
// winner_to_match_id / loser_to_match_id pointers are resolved against the
// just-inserted IDs and back-patched. Mirrors persist_bracket in
// src/tourney/bracket.rs.
func PersistBracket(
	ctx context.Context,
	db *bun.DB,
	game models.Game,
	tournamentID int32,
	drafts []BracketDraft,
) error {
	if len(drafts) == 0 {
		return nil
	}
	now := time.Now().UTC().UnixMilli()
	type key struct {
		bracket     string
		roundNumber int32
		matchNumber int32
	}

	return db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		keyToID := make(map[key]int32, len(drafts))
		inserted := make([]models.BracketMatch, 0, len(drafts))

		for _, draft := range drafts {
			status := BracketPersistStatusPending
			if draft.TeamAID != nil && draft.TeamBID != nil {
				status = BracketPersistStatusReady
			}
			row := &models.NewBracketMatch{
				Game:            game,
				TournamentID:    tournamentID,
				Bracket:         draft.Bracket,
				RoundNumber:     draft.RoundNumber,
				MatchNumber:     draft.MatchNumber,
				Status:          status,
				TeamAID:         draft.TeamAID,
				TeamBID:         draft.TeamBID,
				WinnerTeamID:    nil,
				LoserTeamID:     nil,
				WinnerToMatchID: nil,
				WinnerToSlot:    nil,
				LoserToMatchID:  nil,
				LoserToSlot:     nil,
				CustomMatchID:   nil,
				CreatedAt:       now,
				UpdatedAt:       now,
			}
			var saved models.BracketMatch
			if _, err := tx.NewInsert().
				Model(row).
				Returning("*").
				Exec(ctx, &saved); err != nil {
				return err
			}
			keyToID[key{
				bracket:     draft.Bracket,
				roundNumber: draft.RoundNumber,
				matchNumber: draft.MatchNumber,
			}] = saved.ID
			inserted = append(inserted, saved)
		}

		for i, draft := range drafts {
			var winnerTo *int32
			if draft.WinnerToKey != nil {
				if id, ok := keyToID[key{
					bracket:     draft.WinnerToKey.Bracket,
					roundNumber: draft.WinnerToKey.RoundNumber,
					matchNumber: draft.WinnerToKey.MatchNumber,
				}]; ok {
					winnerTo = &id
				}
			}
			var loserTo *int32
			if draft.LoserToKey != nil {
				if id, ok := keyToID[key{
					bracket:     draft.LoserToKey.Bracket,
					roundNumber: draft.LoserToKey.RoundNumber,
					matchNumber: draft.LoserToKey.MatchNumber,
				}]; ok {
					loserTo = &id
				}
			}
			if winnerTo == nil && loserTo == nil {
				continue
			}
			if _, err := tx.NewUpdate().
				Model((*models.BracketMatch)(nil)).
				Set("winner_to_match_id = ?", winnerTo).
				Set("winner_to_slot = ?", draft.WinnerToSlot).
				Set("loser_to_match_id = ?", loserTo).
				Set("loser_to_slot = ?", draft.LoserToSlot).
				Set("updated_at = ?", now).
				Where("id = ?", inserted[i].ID).
				Exec(ctx); err != nil {
				return err
			}
		}
		return nil
	})
}
