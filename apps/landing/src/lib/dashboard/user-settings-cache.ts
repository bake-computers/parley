import type { UserSettingsJson } from "./user/types.js";

const CACHE_TTL_MS = 60_000;

type Entry = { data: UserSettingsJson; fetchedAt: number };

let cache: Entry | null = null;
let inflight: Promise<UserSettingsJson> | null = null;

export function getCachedUserSettings(): UserSettingsJson | null {
  if (!cache || Date.now() - cache.fetchedAt >= CACHE_TTL_MS) {
    return null;
  }
  return cache.data;
}

export async function fetchUserSettings(): Promise<UserSettingsJson> {
  const hit = getCachedUserSettings();
  if (hit) {
    return hit;
  }
  if (inflight) {
    return inflight;
  }

  inflight = fetch("/api/dashboard/user/settings", { credentials: "include" })
    .then(async (res) => {
      const data = (await res.json()) as { settings?: UserSettingsJson; error?: string };
      if (!res.ok || !data.settings) {
        throw new Error(data.error ?? "Failed to load settings");
      }
      cache = { data: data.settings, fetchedAt: Date.now() };
      return data.settings;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function setCachedUserSettings(settings: UserSettingsJson): void {
  cache = { data: settings, fetchedAt: Date.now() };
}

export function clearUserSettingsCache(): void {
  cache = null;
  inflight = null;
}
