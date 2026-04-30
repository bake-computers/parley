import type { KVNamespace } from "@cloudflare/workers-types";
import { isBotOwner } from "../stats/rateLimit";

const COMMAND_COOLDOWN_KEY_PREFIX = "cmd-cooldown:v1";

export interface CommandCooldownResult {
  allowed: boolean;
  key?: string;
  retryAtMs: number;
  retryAtUnix: number;
  bypassed: boolean;
}

export function buildCommandCooldownKey(commandKey: string, userId: string): string {
  return `${COMMAND_COOLDOWN_KEY_PREFIX}:${commandKey}:${userId}`;
}

export async function consumeCommandCooldown(
  cache: KVNamespace | null | undefined,
  input: {
    commandKey: string;
    userId: string | null | undefined;
    ownerId: string | null | undefined;
    cooldownSeconds: number;
    nowMs?: number;
  },
): Promise<CommandCooldownResult> {
  const nowMs = input.nowMs ?? Date.now();
  const retryAtMs = nowMs + input.cooldownSeconds * 1000;
  const retryAtUnix = Math.ceil(retryAtMs / 1000);

  if (isBotOwner(input.userId, input.ownerId)) {
    return {
      allowed: true,
      retryAtMs,
      retryAtUnix,
      bypassed: true,
    };
  }

  if (!cache || !input.userId) {
    return {
      allowed: true,
      retryAtMs,
      retryAtUnix,
      bypassed: false,
    };
  }

  const key = buildCommandCooldownKey(input.commandKey, input.userId);
  const currentRaw = await cache.get(key, "text");
  const current = currentRaw ? Number(currentRaw) : 0;
  if (Number.isFinite(current) && current > nowMs) {
    return {
      allowed: false,
      key,
      retryAtMs: current,
      retryAtUnix: Math.ceil(current / 1000),
      bypassed: false,
    };
  }

  await cache.put(key, String(retryAtMs), {
    expirationTtl: Math.max(1, Math.ceil(input.cooldownSeconds)),
  });

  return {
    allowed: true,
    key,
    retryAtMs,
    retryAtUnix,
    bypassed: false,
  };
}
