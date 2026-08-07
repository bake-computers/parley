import type { Match, MatchParticipant } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import { ButtonStyle } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from "@parley/runtime";
import { ColorPalette } from "#/utils/constants";
import { formatKDA } from "#/interactions/team/helpers";
import { HISTORY_PAGE_PREFIX } from "#/interactions/history/constants";

type Card = (ContainerBuilder | ActionRowBuilder)[];

const SEPARATOR_SPACING_SMALL = 1;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
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

function ratingDeltaSuffix(delta: number | undefined): string {
  if (delta === undefined) {
    return "";
  }
  const rounded = Math.round(delta);
  return ` (${rounded >= 0 ? "+" : ""}${rounded})`;
}

/** History treats fully unreported K/D/A as a dash, not fabricated zeros. */
function historyKDA(p: MatchParticipant): string {
  if (p.kills === undefined && p.deaths === undefined && p.assists === undefined) {
    return "—";
  }
  return formatKDA(p);
}

function playerLabel(p: MatchParticipant): string {
  return p.username === "" ? `<@${p.discordUserId}>` : p.username;
}

function renderTeam(participants: MatchParticipant[], label: string, won: boolean): string {
  const title = won ? `**${label} — winner**` : `**${label}**`;
  const lines = participants.map(
    (p) => `${playerLabel(p)} — \`${historyKDA(p)}\`${ratingDeltaSuffix(p.ratingDelta)}`,
  );
  return `${title}\n${lines.join("\n")}`;
}

export function buildHistoryErrorCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ColorPalette.error)
    .addComponents(new TextDisplayBuilder().setContent(`**Match History**\n${message}`));
}

/**
 * Build a Components v2 card showing one match per page, with a
 * Previous/Next action row outside the container. `page` is clamped into
 * the window so stale button clicks land on a real page.
 */
export function buildHistoryCard(matches: Match[], page: number): Card {
  if (matches.length === 0) {
    return [
      new ContainerBuilder()
        .setAccentColor(ColorPalette.main)
        .addComponents(
          new TextDisplayBuilder().setContent("**Match History**"),
          separator(),
          new TextDisplayBuilder().setContent("**No matches played yet**"),
          new TextDisplayBuilder().setContent(
            "-# Once your team plays matches, they'll show up here.",
          ),
        ),
    ];
  }

  const current = Math.min(Math.max(page, 0), matches.length - 1);
  const match = matches[current]!;
  const participants = match.participants ?? [];

  const container = new ContainerBuilder().setAccentColor(ColorPalette.main).addComponents(
    new TextDisplayBuilder().setContent(
      `**Match History** — Page **${current + 1}** of **${matches.length}**`,
    ),
    new TextDisplayBuilder().setContent(
      `-# Match #${match.id} · Played ${relativeDiscordTimestamp(createdAtEpochMs(match))}`,
    ),
    separator(),
    new TextDisplayBuilder().setContent(
      renderTeam(
        participants.filter((p) => p.team === "a"),
        "Team A",
        match.winningTeam === "a",
      ),
    ),
    separator(),
    new TextDisplayBuilder().setContent(
      renderTeam(
        participants.filter((p) => p.team === "b"),
        "Team B",
        match.winningTeam === "b",
      ),
    ),
  );

  if (match.mvpUserId) {
    const mvp = participants.find((p) => p.discordUserId === match.mvpUserId);
    if (mvp) {
      container.addComponents(
        separator(),
        new TextDisplayBuilder().setContent(`-# **MVP** ${playerLabel(mvp)}`),
      );
    }
  }

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${HISTORY_PAGE_PREFIX}${current - 1}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current <= 0),
    new ButtonBuilder()
      .setCustomId(`${HISTORY_PAGE_PREFIX}${current + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= matches.length - 1),
  );

  return [container, nav];
}
