import type { GetQueueStatusResponse, JoinQueueResponse, TeamAssignment } from "@parley/proto";
import { ContainerBuilder, SeparatorBuilder, TextDisplayBuilder } from "@parley/runtime";
import { UI_TOKENS } from "#/ui/tokens";

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(1);
}

function teamLines(team: TeamAssignment[]): string {
  const names = team.map((player) => player.username || `<@${player.discordUserId}>`);
  return names.length > 0 ? names.join(", ") : "—";
}

export function buildQueueErrorCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.error)
    .addComponents(
      new TextDisplayBuilder().setContent("**Queue Unavailable**"),
      separator(),
      new TextDisplayBuilder().setContent(message),
    );
}

export function buildQueueJoinedCard(response: JoinQueueResponse): ContainerBuilder {
  if (response.status === "matched" || response.matchId > 0) {
    const probability = Math.round(response.winProbability * 100);
    return new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Match Found**"),
        separator(),
        new TextDisplayBuilder().setContent(`Match **#${response.matchId}** is ready.`),
        new TextDisplayBuilder().setContent(`**Team A** · ${teamLines(response.teamA)}`),
        new TextDisplayBuilder().setContent(`**Team B** · ${teamLines(response.teamB)}`),
        new TextDisplayBuilder().setContent(`Team A win probability · **${probability}%**`),
      );
  }

  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.main)
    .addComponents(
      new TextDisplayBuilder().setContent("**You’re in the Queue**"),
      separator(),
      new TextDisplayBuilder().setContent(`Queue **#${response.queueId}** · solo queue`),
      new TextDisplayBuilder().setContent(
        `Waiting players · **${response.poolWaitingPlayers}**\nRun \`/queue\` again to leave.`,
      ),
    );
}

export function buildQueueLeftCard(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.main)
    .addComponents(
      new TextDisplayBuilder().setContent("**Left the Queue**"),
      separator(),
      new TextDisplayBuilder().setContent("You are no longer waiting for a ranked match."),
    );
}

export function buildQueueActiveCard(status: GetQueueStatusResponse): ContainerBuilder {
  const matched = status.matchId > 0 || status.status === "matched";
  const title = matched ? "**Match Found**" : "**Queue Status**";
  const detail = matched
    ? `Match **#${status.matchId}** has already been formed.`
    : `Your queue is currently **${status.status}**.`;
  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(title),
      separator(),
      new TextDisplayBuilder().setContent(detail),
      new TextDisplayBuilder().setContent(
        `Pool · **${status.poolWaitingPlayers}** players across **${status.poolWaitingStacks}** stacks`,
      ),
    );
}

export function buildQueueServerOnlyCard(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.warning)
    .addComponents(
      new TextDisplayBuilder().setContent("**Queue is Server-only**"),
      separator(),
      new TextDisplayBuilder().setContent("Run `/queue` in a Parley-enabled Discord server."),
    );
}
