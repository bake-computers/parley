// Package services — notify dispatch helpers shared by MatchService
// and TournamentService. Kept in a separate file so the main RPC
// files (match.go, tournament.go) stay focused on Connect handler
// logic and don't grow past the 250 pure LOC ceiling.
package services

import (
	"context"
	"fmt"
	"strconv"

	"github.com/parley-bot/parley/internal/matchmaking"
	"github.com/parley-bot/parley/internal/models"
	"github.com/parley-bot/parley/internal/notify"
)

func (s *MatchService) dispatchMatchReady(
	ctx context.Context,
	game models.Game,
	formed *matchmaking.FormedMatch,
) {
	if s.notifier == nil || !s.notifier.Enabled() {
		return
	}
	hostGuilds, _ := s.match.ParticipantGuildIDsForMatch(ctx, formed.MatchID)
	if len(hostGuilds) == 0 {
		hostGuilds = []string{formed.HostGuildID}
	}
	s.notifier.Dispatch(ctx, notify.Event{
		Event:             notify.EventMatchReady,
		Game:              string(game),
		MatchID:           formatMatchIDInt32(formed.MatchID),
		HostGuildID:       formed.HostGuildID,
		PublicUUID:        formed.PublicUUID.String(),
		ParticipantGuilds: hostGuilds,
	})
}

func (s *MatchService) dispatchMatchResult(
	ctx context.Context,
	game models.Game,
	row *models.MatchRow,
) {
	if s.notifier == nil || !s.notifier.Enabled() || row == nil {
		return
	}
	hostGuilds, _ := s.match.ParticipantGuildIDsForMatch(ctx, row.ID)
	if len(hostGuilds) == 0 {
		hostGuilds = []string{row.GuildID}
	}
	s.notifier.Dispatch(ctx, notify.Event{
		Event:             notify.EventMatchResult,
		Game:              string(game),
		MatchID:           formatMatchIDInt32(row.ID),
		HostGuildID:       row.GuildID,
		PublicUUID:        row.PublicUUID.String(),
		ParticipantGuilds: hostGuilds,
	})
}

func (s *MatchService) dispatchCustomMatchReady(
	ctx context.Context,
	game models.Game,
	savedID int32,
) {
	if s.notifier == nil || !s.notifier.Enabled() {
		return
	}
	row, err := s.match.Get(ctx, game, savedID)
	if err != nil || row == nil {
		return
	}
	hostGuilds, _ := s.match.ParticipantGuildIDsForMatch(ctx, row.ID)
	if len(hostGuilds) == 0 {
		hostGuilds = []string{row.GuildID}
	}
	s.notifier.Dispatch(ctx, notify.Event{
		Event:             notify.EventMatchReady,
		Game:              string(game),
		MatchID:           formatMatchIDInt32(row.ID),
		HostGuildID:       row.GuildID,
		PublicUUID:        row.PublicUUID.String(),
		ParticipantGuilds: hostGuilds,
	})
}

func (s *TournamentService) dispatchTournamentEvent(
	ctx context.Context,
	game models.Game,
	t *models.Tournament,
	event notify.EventType,
) {
	if s.notifier == nil || !s.notifier.Enabled() || t == nil {
		return
	}
	hostGuilds, _ := s.tourn.ParticipantGuildIDs(ctx, t.ID)
	if len(hostGuilds) == 0 {
		hostGuilds = []string{t.CreatedByGuildID}
	}
	s.notifier.Dispatch(ctx, notify.Event{
		Event:             event,
		Game:              string(game),
		TournamentID:      strconv.FormatInt(int64(t.ID), 10),
		HostGuildID:       t.CreatedByGuildID,
		ParticipantGuilds: hostGuilds,
	})
}

func (s *TournamentService) dispatchBracketResult(
	ctx context.Context,
	game models.Game,
	t *models.Tournament,
	event notify.EventType,
) {
	if s.notifier == nil || !s.notifier.Enabled() || t == nil {
		return
	}
	hostGuilds, _ := s.tourn.ParticipantGuildIDs(ctx, t.ID)
	if len(hostGuilds) == 0 {
		hostGuilds = []string{t.CreatedByGuildID}
	}
	s.notifier.Dispatch(ctx, notify.Event{
		Event:             event,
		Game:              string(game),
		TournamentID:      strconv.FormatInt(int64(t.ID), 10),
		HostGuildID:       t.CreatedByGuildID,
		ParticipantGuilds: hostGuilds,
	})
}

func formatMatchIDInt32(v int32) string {
	return fmt.Sprintf("%d", v)
}
