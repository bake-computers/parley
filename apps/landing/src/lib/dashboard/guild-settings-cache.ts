import type { GuildSettingsBundleJson } from "./api-types";

const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry = { data: GuildSettingsBundleJson; fetchedAt: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<GuildSettingsBundleJson>>();

export function getCachedGuildSettings(guildId: string): GuildSettingsBundleJson | null {
  const entry = cache.get(guildId);
  if (!entry || Date.now() - entry.fetchedAt >= CACHE_TTL_MS) {
    return null;
  }
  return entry.data;
}

export async function fetchGuildSettings(
  guildId: string,
  { background = false }: { background?: boolean } = {},
): Promise<GuildSettingsBundleJson> {
  if (!background) {
    const cached = getCachedGuildSettings(guildId);
    if (cached) {
      return cached;
    }
  }

  const pending = inflight.get(guildId);
  if (pending) {
    return pending;
  }

  const promise = fetch(`/api/dashboard/guilds/${guildId}/settings`, { credentials: "include" })
    .then(async (res) => {
      const data = (await res.json()) as GuildSettingsBundleJson & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load settings");
      }
      cache.set(guildId, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => {
      inflight.delete(guildId);
    });

  inflight.set(guildId, promise);
  return promise;
}

export function prefetchGuildSettings(guildId: string): void {
  if (getCachedGuildSettings(guildId) || inflight.has(guildId)) {
    return;
  }
  void fetchGuildSettings(guildId).catch(() => {});
}

export function patchCachedGuildSettings(
  guildId: string,
  partial: Partial<GuildSettingsBundleJson>,
): void {
  const entry = cache.get(guildId);
  if (entry) {
    cache.set(guildId, { data: { ...entry.data, ...partial }, fetchedAt: entry.fetchedAt });
  }
}
