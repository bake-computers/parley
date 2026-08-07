import { ButtonStyle } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  UserSelectMenuBuilder,
} from "@parley/runtime";
import type { Match, MatchParticipant } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import { ColorPalette, WarningOrangeEmoji } from "#/utils/constants";
import {
  TEAM_END_PREFIX,
  TEAM_MAX_PLAYERS,
  TEAM_MIN_PLAYERS,
  TEAM_ROUND_LOG_PREFIX,
  TEAM_USER_SELECT,
  TEAM_WINNER_PREFIX,
  type TeamSide,
} from "#/interactions/team/constants";
import { formatKDA } from "#/interactions/team/helpers";

type Card = (ContainerBuilder | ActionRowBuilder)[];

const SEPARATOR_SPACING_SMALL = 1;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function renderTeam(participants: MatchParticipant[], label: string, won: boolean): string {
  const title = won ? `**${label} — winner**` : `**${label}**`;
  const lines = participants.map((p) => {
    const name = p.username === "" ? `<@${p.discordUserId}>` : p.username;
    return `${name} — \`${formatKDA(p)}\``;
  });
  return `${title}\n${lines.join("\n")}`;
}

/** Initial card: pick the players, OVI does the rest. */
export function buildTeamSetupCard(): Card {
  const container = new ContainerBuilder()
    .setAccentColor(ColorPalette.main)
    .addComponents(
      new TextDisplayBuilder().setContent("**Custom Match**"),
      separator(),
      new TextDisplayBuilder().setContent(
        `Pick **${TEAM_MIN_PLAYERS}–${TEAM_MAX_PLAYERS}** players (even number) and Parley assembles balanced teams.`,
      ),
    );
  const select = new UserSelectMenuBuilder()
    .setCustomId(TEAM_USER_SELECT)
    .setPlaceholder("Pick players")
    .setMinValues(TEAM_MIN_PLAYERS)
    .setMaxValues(TEAM_MAX_PLAYERS);
  return [container, new ActionRowBuilder().addComponents(select)];
}

/** Live scoreboard shown between rounds. */
export function buildScoreboardCard(match: Match): Card {
  const participants = match.participants ?? [];
  const container = new ContainerBuilder().setAccentColor(ColorPalette.main).addComponents(
    new TextDisplayBuilder().setContent(`**Custom Match** — #${match.id}`),
    new TextDisplayBuilder().setContent("-# Log each round as it ends; K/D/A totals update below."),
    separator(),
    new TextDisplayBuilder().setContent(
      renderTeam(
        participants.filter((p) => p.team === "a"),
        "Team A",
        false,
      ),
    ),
    separator(),
    new TextDisplayBuilder().setContent(
      renderTeam(
        participants.filter((p) => p.team === "b"),
        "Team B",
        false,
      ),
    ),
  );

  const logRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TEAM_ROUND_LOG_PREFIX}/${match.id}/a`)
      .setLabel("Log round — Team A")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${TEAM_ROUND_LOG_PREFIX}/${match.id}/b`)
      .setLabel("Log round — Team B")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${TEAM_END_PREFIX}/${match.id}`)
      .setLabel("End match")
      .setStyle(ButtonStyle.Danger),
  );
  return [container, logRow];
}

/** "Who won?" step before reporting the result. */
export function buildWinnerPromptCard(matchId: number): Card {
  const container = new ContainerBuilder()
    .setAccentColor(ColorPalette.warning)
    .addComponents(new TextDisplayBuilder().setContent("**End match**\nWhich team won?"));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TEAM_WINNER_PREFIX}/${matchId}/a`)
      .setLabel("Team A wins")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${TEAM_WINNER_PREFIX}/${matchId}/b`)
      .setLabel("Team B wins")
      .setStyle(ButtonStyle.Primary),
  );
  return [container, row];
}

/** Terminal card once ReportMatchResult has landed. */
export function buildFinalCard(match: Match): ContainerBuilder {
  const participants = match.participants ?? [];
  const teamAWon = match.winningTeam === "a";
  const teamBWon = match.winningTeam === "b";
  return new ContainerBuilder().setAccentColor(ColorPalette.main).addComponents(
    new TextDisplayBuilder().setContent(`**Custom Match** — #${match.id}`),
    separator(),
    new TextDisplayBuilder().setContent(
      renderTeam(
        participants.filter((p) => p.team === "a"),
        "Team A",
        teamAWon,
      ),
    ),
    separator(),
    new TextDisplayBuilder().setContent(
      renderTeam(
        participants.filter((p) => p.team === "b"),
        "Team B",
        teamBWon,
      ),
    ),
    separator(),
    new TextDisplayBuilder().setContent("-# Ratings updated. Find this match in `/history`."),
  );
}

export function buildTeamErrorCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ColorPalette.error)
    .addComponents(
      new TextDisplayBuilder().setContent(`${WarningOrangeEmoji} **Custom Match**\n${message}`),
    );
}

export function teamSideLabel(side: TeamSide): string {
  return side === "a" ? "Team A" : "Team B";
}
