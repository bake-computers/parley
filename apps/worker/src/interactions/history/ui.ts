import type { Match, MatchParticipant } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import { ContainerBuilder, TextDisplayBuilder } from "@parley/runtime";
import {
  HISTORY_DISCORD_CHARACTER_BUDGET,
  MATCH_PORTAL_BASE_URL,
} from "./constants.js";

function relativeDiscordTimestamp(epochMs: bigint): string {
  const unixSeconds = Number(epochMs / 1000n);
  return `<t:${unixSeconds}:R>`;
}

function teamName(
  participants: MatchParticipant[],
  teamKey: string,
): string {
  const names = participants
    .filter((p) => p.team === teamKey && p.username !== "")
    .map((p) => p.username);
  return names.length > 0 ? names.join(", ") : "—";
}

function buildMatchText(
  match: Match,
  guildId: string,
): string {
  const teamA = teamName(match.participants, "team_a");
  const teamB = teamName(match.participants, "team_b");

  const teamAWins = match.winningTeam === "team_a";
  const teamBWins = match.winningTeam === "team_b";

  const teamALabel = teamAWins ? `**${teamA}**` : teamA;
  const teamBLabel = teamBWins ? `**${teamB}**` : teamB;

  let text = `${teamALabel} vs ${teamBLabel}`;
  text += `\n-# [View Report](${MATCH_PORTAL_BASE_URL}/${guildId}/${match.publicUuid})`;
  text += `\n-# Played ${relativeDiscordTimestamp(match.createdAtMs)}`;

  if (match.mvpUserId) {
    const mvp = match.participants.find(
      (p) => p.discordUserId === match.mvpUserId,
    );
    if (mvp && mvp.username !== "") {
      text += `\n-# **MVP** ${mvp.username}`;
    }
  }

  return text;
}

/**
 * Build a Components v2 Container displaying recent match history.
 *
 * Matches are rendered newest-first. The total character count is soft-capped
 * at {@link HISTORY_DISCORD_CHARACTER_BUDGET} — when adding a match would
 * exceed the budget, remaining matches are dropped.
 */
export function buildHistoryCard(
  matches: Match[],
  guildId: string,
): ContainerBuilder {
  const container = new ContainerBuilder();

  if (matches.length === 0) {
    container.addComponents(
      new TextDisplayBuilder().setContent("**No matches played yet**"),
      new TextDisplayBuilder().setContent(
        "-# Once your team plays matches, they'll show up here.",
      ),
    );
    return container;
  }

  const headerText = `**Recent Matches** \u2014 last ${matches.length}`;
  const components: TextDisplayBuilder[] = [
    new TextDisplayBuilder().setContent(headerText),
  ];

  let totalChars = headerText.length;

  for (const match of matches) {
    const text = buildMatchText(match, guildId);
    if (totalChars + text.length > HISTORY_DISCORD_CHARACTER_BUDGET) {
      break;
    }
    components.push(new TextDisplayBuilder().setContent(text));
    totalChars += text.length;
  }

  container.addComponents(...components);
  return container;
}
