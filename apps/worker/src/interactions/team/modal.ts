import { TextInputStyle } from "discord-api-types/v10";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder } from "@parley/runtime";
import type { Match } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import {
  TEAM_MAX_PER_TEAM,
  TEAM_ROUND_INPUT_PREFIX,
  TEAM_ROUND_MODAL_PREFIX,
  type TeamSide,
} from "#/interactions/team/constants";
import { teamParticipants } from "#/interactions/team/helpers";

export function roundModalCustomId(matchId: number, side: TeamSide): string {
  return `${TEAM_ROUND_MODAL_PREFIX}/${matchId}/${side}`;
}

export function roundInputCustomId(slot: number): string {
  return `${TEAM_ROUND_INPUT_PREFIX}-${slot}`;
}

/**
 * One modal per team per round: up to five short inputs labelled with the
 * player's username, each taking "K D A". Empty inputs count as zeros.
 */
export function buildRoundModal(match: Match, side: TeamSide): ModalBuilder {
  const players = teamParticipants(match, side).slice(0, TEAM_MAX_PER_TEAM);
  const modal = new ModalBuilder()
    .setCustomId(roundModalCustomId(match.id, side))
    .setTitle(`Log a round — Team ${side.toUpperCase()}`);
  players.forEach((player, slot) => {
    const label = player.username === "" ? `Player ${slot + 1}` : player.username;
    const input = new TextInputBuilder()
      .setCustomId(roundInputCustomId(slot))
      .setLabel(label.slice(0, 45))
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("kills deaths assists, e.g. 4 5 2")
      .setRequired(false)
      .setMaxLength(32);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });
  return modal;
}
