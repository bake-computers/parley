import { ComponentType } from "discord-api-types/v10";
import {
  ComponentHandler,
  ModalHandler,
  logger,
  parseCustomId,
  type MessageComponentInteraction,
  type ModalInteraction,
} from "@parley/runtime";
import { Game } from "@parley/proto";
import { editReplyV2, updateV2 } from "#/utils/discord";
import type { EngineTransportEnv } from "#/transport";
import {
  TEAM_MAX_PLAYERS,
  TEAM_MIN_PLAYERS,
  TEAM_ROUND_MODAL_PREFIX,
  TEAM_USER_SELECT,
  isTeamSide,
} from "#/interactions/team/constants";
import {
  isParticipant,
  parseKDA,
  selectValues,
  teamParticipants,
} from "#/interactions/team/helpers";
import { buildRoundModal, roundInputCustomId } from "#/interactions/team/modal";
import {
  invokeCreateCustomMatch,
  invokeGetMatch,
  invokeReportMatchResult,
  invokeReportPlayerRoundStats,
  type RoundStatInput,
} from "#/interactions/team/rpc";
import {
  buildFinalCard,
  buildScoreboardCard,
  buildTeamErrorCard,
  buildWinnerPromptCard,
  teamSideLabel,
} from "#/interactions/team/ui";

function envOf(interaction: MessageComponentInteraction | ModalInteraction): EngineTransportEnv {
  return interaction.context.env as EngineTransportEnv;
}

function parseMatchId(raw: string | undefined): number | undefined {
  if (!raw || !/^\d+$/u.test(raw)) {
    return undefined;
  }
  return Number(raw);
}

/**
 * Step 1: the player picker. On submit we create the match immediately —
 * CreateCustomMatch runs the OVI partition, persists the match, and returns
 * the teams, so no separate "assemble" step is needed.
 */
export const teamSelectHandler = new ComponentHandler("team", ComponentType.UserSelect).addHandler(
  async (interaction: MessageComponentInteraction) => {
    if (interaction.customId !== TEAM_USER_SELECT) {
      return;
    }
    const deferred = await interaction.deferUpdate();
    if (deferred.isErr()) {
      logger.error("team.defer_failed", "Failed to defer user select", {
        error: deferred.error,
      });
      return;
    }

    const env = envOf(interaction);
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    if (!guildId || !channelId) {
      await editReplyV2(interaction, buildTeamErrorCard("Use /team in a server channel."));
      return;
    }

    const discordUserIds = selectValues(interaction);
    if (discordUserIds.length < TEAM_MIN_PLAYERS || discordUserIds.length > TEAM_MAX_PLAYERS) {
      await editReplyV2(
        interaction,
        buildTeamErrorCard(`Pick between ${TEAM_MIN_PLAYERS} and ${TEAM_MAX_PLAYERS} players.`),
      );
      return;
    }
    if (discordUserIds.length % 2 !== 0) {
      await editReplyV2(
        interaction,
        buildTeamErrorCard("Pick an even number of players so the teams are equal."),
      );
      return;
    }

    const created = await invokeCreateCustomMatch(env, {
      guildId,
      channelId,
      createdByDiscordUserId: interaction.user?.id ?? "",
      game: Game.R6,
      discordUserIds,
      teamSize: discordUserIds.length / 2,
    });
    if (created.isErr()) {
      await editReplyV2(interaction, buildTeamErrorCard(created.error.message));
      return;
    }
    if (!created.value.success || !created.value.matchId) {
      await editReplyV2(
        interaction,
        buildTeamErrorCard(created.value.error?.message ?? "Could not assemble teams."),
      );
      return;
    }

    const fetched = await invokeGetMatch(env, created.value.matchId, Game.R6);
    if (fetched.isErr() || !fetched.value.success || !fetched.value.match) {
      await editReplyV2(interaction, buildTeamErrorCard("Match created but could not be loaded."));
      return;
    }
    await editReplyV2(interaction, buildScoreboardCard(fetched.value.match));
  },
);

/**
 * Buttons: open the round-log modal, show the winner prompt, and report
 * the final result. The match is re-fetched on every click — the engine
 * is the source of truth and this worker keeps no state.
 */
export const teamButtonHandler = new ComponentHandler("team", ComponentType.Button).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const parsed = parseCustomId(interaction.customId);
    if (typeof parsed === "string") {
      return;
    }
    const [prefix, action, matchIdRaw, sideRaw] = parsed.path;
    if (prefix !== "team" || (action !== "round-log" && action !== "end" && action !== "winner")) {
      return;
    }
    const matchId = parseMatchId(matchIdRaw);
    if (matchId === undefined) {
      return;
    }

    const env = envOf(interaction);
    const userId = interaction.user?.id ?? "";
    const fetched = await invokeGetMatch(env, matchId, Game.R6);
    if (fetched.isErr() || !fetched.value.success || !fetched.value.match) {
      await updateV2(interaction, buildTeamErrorCard("Could not load that match."));
      return;
    }
    const match = fetched.value.match;
    if (match.status !== "active") {
      await updateV2(interaction, buildFinalCard(match));
      return;
    }
    if (!isParticipant(match, userId)) {
      await updateV2(
        interaction,
        buildTeamErrorCard("Only players in this match can log rounds or end it."),
      );
      return;
    }

    if (action === "round-log") {
      if (!isTeamSide(sideRaw)) {
        return;
      }
      const shown = await interaction.showModal(buildRoundModal(match, sideRaw));
      if (shown.isErr()) {
        logger.error("team.modal_open_failed", "Failed to open round modal", {
          error: shown.error,
        });
      }
      return;
    }

    if (action === "end") {
      await updateV2(interaction, buildWinnerPromptCard(matchId));
      return;
    }

    // action === "winner"
    if (!isTeamSide(sideRaw)) {
      return;
    }
    const deferred = await interaction.deferUpdate();
    if (deferred.isErr()) {
      logger.error("team.defer_failed", "Failed to defer winner button", {
        error: deferred.error,
      });
      return;
    }
    const reported = await invokeReportMatchResult(env, {
      matchId,
      game: Game.R6,
      winningTeam: sideRaw,
      reportedByDiscordUserId: userId,
    });
    if (reported.isErr()) {
      await editReplyV2(interaction, buildTeamErrorCard(reported.error.message));
      return;
    }
    if (!reported.value.success || !reported.value.match) {
      await editReplyV2(
        interaction,
        buildTeamErrorCard(reported.value.error?.message ?? "Could not end the match."),
      );
      return;
    }
    await editReplyV2(interaction, buildFinalCard(reported.value.match));
  },
);

/**
 * Round modal submit: parse each player's "K D A" line and ship the round
 * to the engine, which accumulates it onto the participant totals.
 */
export const teamModalHandler = new ModalHandler(TEAM_ROUND_MODAL_PREFIX).addHandler(
  async (interaction: ModalInteraction) => {
    const parsed = parseCustomId(interaction.customId);
    if (typeof parsed === "string") {
      return;
    }
    const [prefix, matchIdRaw, sideRaw] = parsed.path;
    if (prefix !== TEAM_ROUND_MODAL_PREFIX || !isTeamSide(sideRaw)) {
      return;
    }
    const matchId = parseMatchId(matchIdRaw);
    if (matchId === undefined) {
      return;
    }

    const deferred = await interaction.deferUpdate();
    if (deferred.isErr()) {
      return;
    }

    const env = envOf(interaction);
    const userId = interaction.user?.id ?? "";
    const fetched = await invokeGetMatch(env, matchId, Game.R6);
    if (fetched.isErr() || !fetched.value.success || !fetched.value.match) {
      await editReplyV2(interaction, buildTeamErrorCard("Could not load that match."));
      return;
    }
    const match = fetched.value.match;
    if (match.status !== "active") {
      await editReplyV2(interaction, buildFinalCard(match));
      return;
    }
    if (!isParticipant(match, userId)) {
      await editReplyV2(
        interaction,
        buildTeamErrorCard("Only players in this match can log rounds."),
      );
      return;
    }

    const players = teamParticipants(match, sideRaw);
    const stats: RoundStatInput[] = [];
    for (let slot = 0; slot < players.length; slot++) {
      const player = players[slot]!;
      const raw = interaction.fields.getString(roundInputCustomId(slot)) ?? "";
      const kda = parseKDA(raw);
      if (typeof kda === "string") {
        const name = player.username === "" ? `<@${player.discordUserId}>` : player.username;
        await editReplyV2(
          interaction,
          buildTeamErrorCard(`**${name}** (${teamSideLabel(sideRaw)}): ${kda}`),
        );
        return;
      }
      stats.push({
        discordUserId: player.discordUserId,
        kills: kda.kills,
        deaths: kda.deaths,
        assists: kda.assists,
      });
    }

    const reported = await invokeReportPlayerRoundStats(env, {
      matchId,
      game: Game.R6,
      stats,
      reportedByDiscordUserId: userId,
    });
    if (reported.isErr()) {
      await editReplyV2(interaction, buildTeamErrorCard(reported.error.message));
      return;
    }
    if (!reported.value.success || !reported.value.match) {
      await editReplyV2(
        interaction,
        buildTeamErrorCard(reported.value.error?.message ?? "Could not log that round."),
      );
      return;
    }
    await editReplyV2(interaction, buildScoreboardCard(reported.value.match));
  },
);
