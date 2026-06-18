import type { Match, MatchParticipant } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import { ContainerBuilder, SeparatorBuilder, TextDisplayBuilder } from "@parley/runtime";
import { UI_TOKENS } from "../../ui/tokens.js";
import {
  HISTORY_DISCORD_CHARACTER_BUDGET,
  MATCH_PORTAL_BASE_URL,
} from "./constants.js";

const SEPARATOR_SPACING_SMALL = 1;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function matchParticipants(match: Match): MatchParticipant[] {
  return match.participants ?? [];
}

function createdAtEpochMs(match: Match): bigint {
  const raw = match.createdAtMs;
  if (typeof raw === "bigint") {
    return raw;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return BigInt(Math.trunc(raw));
  }
  return 0n;
}

function relativeDiscordTimestamp(epochMs: bigint): string {
  if (epochMs <= 0n) {
    return "unknown time";
  }
  const unixSeconds = Number(epochMs / 1000n);
  return `<t:${unixSeconds}:R>`;
}

function teamName(participants: MatchParticipant[], teamKey: string): string {
  const names = participants
    .filter((p) => p.team === teamKey && p.username !== "")
    .map((p) => p.username);
  return names.length > 0 ? names.join(", ") : "—";
}

function buildMatchText(match: Match, guildId: string): string {
  const participants = matchParticipants(match);
  const teamA = teamName(participants, "team_a");
  const teamB = teamName(participants, "team_b");

  const teamAWins = match.winningTeam === "team_a";
  const teamBWins = match.winningTeam === "team_b";

  const teamALabel = teamAWins ? `**${teamA}**` : teamA;
  const teamBLabel = teamBWins ? `**${teamB}**` : teamB;

  let text = `${teamALabel} vs ${teamBLabel}`;
  text += `\n-# [View Report](${MATCH_PORTAL_BASE_URL}/${guildId}/${match.publicUuid})`;
  text += `\n-# Played ${relativeDiscordTimestamp(createdAtEpochMs(match))}`;

  if (match.mvpUserId) {
    const mvp = participants.find((p) => p.discordUserId === match.mvpUserId);
    if (mvp && mvp.username !== "") {
      text += `\n-# **MVP** ${mvp.username}`;
    }
  }

  return text;
}

export function buildHistoryErrorCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.error)
    .addComponents(new TextDisplayBuilder().setContent(`**Match History**\n${message}`));
}

/**
 * Build a Components v2 Container displaying recent match history.
 *
 * Matches are rendered newest-first. The total character count is soft-capped
 * at {@link HISTORY_DISCORD_CHARACTER_BUDGET} — when adding a match would
 * exceed the budget, remaining matches are dropped.
 */
export function buildHistoryCard(matches: Match[], guildId: string): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(UI_TOKENS.main);

  if (matches.length === 0) {
    container.addComponents(
      new TextDisplayBuilder().setContent("**Recent Matches**"),
      separator(),
      new TextDisplayBuilder().setContent("**No matches played yet**"),
      new TextDisplayBuilder().setContent(
        "-# Once your team plays matches, they'll show up here.",
      ),
    );
    return container;
  }

  const headerText = `**Recent Matches** \u2014 last ${matches.length}`;
  container.addComponents(new TextDisplayBuilder().setContent(headerText), separator());

  let totalChars = headerText.length;

  for (const match of matches) {
    const text = buildMatchText(match, guildId);
    if (totalChars + text.length > HISTORY_DISCORD_CHARACTER_BUDGET) {
      break;
    }
    container.addComponents(new TextDisplayBuilder().setContent(text), separator());
    totalChars += text.length;
  }

  return container;
}