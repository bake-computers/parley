import { Game } from "@parley/proto";
import {
  ContainerBuilder,
  SlashCommand,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
} from "@parley/runtime";
import { assertAccepted } from "#/interactions/_shared/acceptance";
import { getMatchmakingClient, type EngineTransportEnv } from "#/transport";
import { editReplyV2, replyV2, updateV2 } from "#/ui/discord";
import {
  QUEUE_ACCEPTANCE_SOURCE,
  QUEUE_COMMAND_DESCRIPTION,
  QUEUE_COMMAND_NAME,
} from "#/interactions/queue/constants";
import { invokeGetQueueStatus, invokeJoinQueue, invokeLeaveQueue } from "#/interactions/queue/rpc";
import {
  buildQueueActiveCard,
  buildQueueErrorCard,
  buildQueueJoinedCard,
  buildQueueLeftCard,
  buildQueueServerOnlyCard,
} from "#/interactions/queue/ui";

type QueueInteraction = ChatInputCommandInteraction | MessageComponentInteraction;

function responseError(
  response: { error?: { message?: string | undefined } | undefined },
  fallback: string,
): string {
  return response.error?.message || fallback;
}

export async function toggleQueue(interaction: QueueInteraction): Promise<ContainerBuilder> {
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const discordUserId = interaction.user?.id;
  if (!guildId || !channelId || !discordUserId) {
    return buildQueueServerOnlyCard();
  }

  const env = interaction.context.env as EngineTransportEnv;
  const client = getMatchmakingClient(env) as never;
  const status = await invokeGetQueueStatus(client, {
    discordUserId,
    guildId,
    game: Game.R6,
    teamSize: 0,
  } as never);
  if (status.isErr()) {
    return buildQueueErrorCard(`Could not load your queue status: ${status.error.message}`);
  }
  if (!status.value.success) {
    return buildQueueErrorCard(responseError(status.value, "Could not load your queue status."));
  }

  if (status.value.status === "idle") {
    const joined = await invokeJoinQueue(client, {
      guildId,
      channelId,
      captainDiscordUserId: discordUserId,
      game: Game.R6,
      discordUserIds: [discordUserId],
      teamSize: 0,
    } as never);
    if (joined.isErr()) {
      return buildQueueErrorCard(`Could not join the queue: ${joined.error.message}`);
    }
    if (!joined.value.success) {
      return buildQueueErrorCard(responseError(joined.value, "Could not join the queue."));
    }
    return buildQueueJoinedCard(joined.value);
  }

  if (status.value.status === "waiting") {
    const left = await invokeLeaveQueue(client, {
      captainDiscordUserId: discordUserId,
      game: Game.R6,
    } as never);
    if (left.isErr()) {
      return buildQueueErrorCard(`Could not leave the queue: ${left.error.message}`);
    }
    if (!left.value.success) {
      return buildQueueErrorCard(responseError(left.value, "Could not leave the queue."));
    }
    return buildQueueLeftCard();
  }

  return buildQueueActiveCard(status.value);
}

export const queueSlashCommand = new SlashCommand()
  .setName(QUEUE_COMMAND_NAME)
  .setDescription(QUEUE_COMMAND_DESCRIPTION)
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId || !interaction.channelId) {
      await replyV2(interaction, buildQueueServerOnlyCard());
      return;
    }

    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never, undefined, QUEUE_ACCEPTANCE_SOURCE))) {
      return;
    }
    await editReplyV2(interaction, await toggleQueue(interaction));
  });

export async function resumeQueueAfterAccept(interaction: MessageComponentInteraction): Promise<void> {
  await updateV2(interaction, await toggleQueue(interaction));
}
