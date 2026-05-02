import { consumeCommandCooldown } from "@parley/core";
import { formatDiscordRetryAt } from "@parley/core/stats-rate-limit";
import type { WorkerRuntimeEnv } from "../env";
import { buildComponentsV2Reply, buildNoticeCard } from "./ui";

type CooldownEnv = Partial<WorkerRuntimeEnv>;

export const COMMAND_COOLDOWNS = {
  "account.me": 5,
  "account.refresh": 10,
  "account.register": 10,
  "account.unregister": 10,
  help: 3,
  leaderboard: 5,
  "limit.clear": 30,
  "limit.set": 30,
  "limit.show": 5,
  ping: 3,
  "queue.cancel": 10,
  "queue.start": 10,
  "queue.status": 5,
  stats: 5,
  "team.create": 10,
  "tournament.browse": 10,
  "tournament.cancel": 30,
  "tournament.create": 30,
  "tournament.forfeit": 30,
  "tournament.join": 10,
  "tournament.leave": 10,
  "tournament.start": 30,
  "tournament.view": 5,
} as const;

export async function enforceCommandCooldown(
  env: CooldownEnv,
  input: {
    commandKey: keyof typeof COMMAND_COOLDOWNS;
    userId: string | null | undefined;
  },
): Promise<
  { allowed: true } | { allowed: false; payload: ReturnType<typeof buildComponentsV2Reply> }
> {
  const result = await consumeCommandCooldown(env.Cache, {
    commandKey: input.commandKey,
    userId: input.userId,
    ownerId: env.DISCORD_BOT_OWNER_ID,
    cooldownSeconds: COMMAND_COOLDOWNS[input.commandKey],
  });

  if (result.allowed) {
    return { allowed: true };
  }

  return {
    allowed: false,
    payload: buildComponentsV2Reply([
      buildNoticeCard({
        title: "Slow down",
        message: `That command is on cooldown.\nRetry at ${formatDiscordRetryAt(result.retryAtUnix)}.`,
        tone: "warning",
        emojiName: "timer",
      }),
    ]),
  };
}
