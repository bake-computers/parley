import type { KVNamespace } from "@cloudflare/workers-types";
import type {
  APIMessageComponentEmoji,
  RESTGetAPIApplicationEmojisResult,
} from "discord-api-types/v10";
import { logger } from "./logger.js";
import { DiscordRestClient } from "../rest.js";

const APPLICATION_EMOJI_CACHE_KEY = "discord:application-emojis:v2";
const APPLICATION_EMOJI_CACHE_TTL_SECONDS = 21_600;
const APPLICATION_EMOJI_CACHE_VERSION = 1;

export const APP_EMOJI_NAMES = [
  "warning_orange",
  "trash",
  "trash_red",
  "timeout",
  "time",
  "reload",
  "redirect",
  "pin",
  "linked",
  "global",
  "calendar",
  "ban_hammer",
  "ban_hammer_red",
  "rank_unspecified",
  "rank_iron",
  "rank_bronze",
  "rank_silver",
  "rank_gold",
  "rank_platinum",
  "rank_diamond",
  "rank_master",
  "rank_grandmaster",
  "rank_challenger",
] as const;

export type AppEmojiName = (typeof APP_EMOJI_NAMES)[number];

export interface ApplicationEmojiEntry {
  id: string;
  name: AppEmojiName;
  animated: boolean;
}

export type ApplicationEmojiCatalog = Partial<Record<AppEmojiName, ApplicationEmojiEntry>>;

interface ApplicationEmojiCachePayload {
  version: 1;
  fetchedAt: number;
  entries: ApplicationEmojiCatalog;
}

const APP_EMOJI_NAME_SET = new Set<string>(APP_EMOJI_NAMES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAppEmojiName(value: unknown): value is AppEmojiName {
  return typeof value === "string" && APP_EMOJI_NAME_SET.has(value);
}

function isApplicationEmojiEntry(value: unknown): value is ApplicationEmojiEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["id"] === "string" &&
    value["id"].length > 0 &&
    isAppEmojiName(value["name"]) &&
    typeof value["animated"] === "boolean"
  );
}

function normalizeApplicationEmojiCatalog(value: unknown): ApplicationEmojiCatalog | null {
  if (!isRecord(value)) {
    return null;
  }

  const entries: ApplicationEmojiCatalog = {};

  for (const emojiName of APP_EMOJI_NAMES) {
    const entry = value[emojiName];
    if (entry === undefined) {
      continue;
    }

    if (!isApplicationEmojiEntry(entry) || entry.name !== emojiName) {
      return null;
    }

    entries[emojiName] = entry;
  }

  return entries;
}

function parseApplicationEmojiCachePayload(value: unknown): ApplicationEmojiCachePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value["version"] !== APPLICATION_EMOJI_CACHE_VERSION ||
    typeof value["fetchedAt"] !== "number" ||
    !Number.isFinite(value["fetchedAt"])
  ) {
    return null;
  }

  const entries = normalizeApplicationEmojiCatalog(value["entries"]);
  if (!entries) {
    return null;
  }

  return {
    version: APPLICATION_EMOJI_CACHE_VERSION,
    fetchedAt: value["fetchedAt"],
    entries,
  };
}

function normalizeFetchedEmojiCatalog(
  response: RESTGetAPIApplicationEmojisResult,
): ApplicationEmojiCatalog | null {
  if (!isRecord(response) || !Array.isArray(response.items)) {
    return null;
  }

  const catalog: ApplicationEmojiCatalog = {};

  for (const item of response.items) {
    if (!isRecord(item)) {
      return null;
    }

    if (typeof item.name !== "string" || typeof item.id !== "string") {
      return null;
    }

    if (!APP_EMOJI_NAME_SET.has(item.name)) {
      continue;
    }

    catalog[item.name as AppEmojiName] = {
      id: item.id,
      name: item.name as AppEmojiName,
      animated: Boolean(item.animated),
    };
  }

  return catalog;
}

async function readCachedApplicationEmojiCatalog(
  cache: KVNamespace | null | undefined,
): Promise<ApplicationEmojiCatalog | null> {
  if (!cache) {
    return null;
  }

  let raw: string | null;
  try {
    raw = await cache.get(APPLICATION_EMOJI_CACHE_KEY);
  } catch (error) {
    logger.warn("discord.emoji.cache_read_failed", "Failed to read application emoji cache", {
      key: APPLICATION_EMOJI_CACHE_KEY,
      error,
    });
    return {};
  }

  if (!raw) {
    return null;
  }

  try {
    const payload = parseApplicationEmojiCachePayload(JSON.parse(raw));
    if (!payload) {
      logger.warn("discord.emoji.cache_invalid", "Application emoji cache payload was invalid", {
        key: APPLICATION_EMOJI_CACHE_KEY,
      });
      return {};
    }

    return payload.entries;
  } catch (error) {
    logger.warn("discord.emoji.cache_invalid", "Application emoji cache payload was invalid", {
      key: APPLICATION_EMOJI_CACHE_KEY,
      error,
    });
    return {};
  }
}

async function writeCachedApplicationEmojiCatalog(
  cache: KVNamespace | null | undefined,
  entries: ApplicationEmojiCatalog,
): Promise<boolean> {
  if (!cache) {
    return true;
  }

  try {
    await cache.put(
      APPLICATION_EMOJI_CACHE_KEY,
      JSON.stringify({
        version: APPLICATION_EMOJI_CACHE_VERSION,
        fetchedAt: Date.now(),
        entries,
      } satisfies ApplicationEmojiCachePayload),
      { expirationTtl: APPLICATION_EMOJI_CACHE_TTL_SECONDS },
    );
    return true;
  } catch (error) {
    logger.warn("discord.emoji.cache_write_failed", "Failed to write application emoji cache", {
      key: APPLICATION_EMOJI_CACHE_KEY,
      error,
    });
    return false;
  }
}

export async function resolveApplicationEmojiCatalog(input: {
  applicationId?: string;
  botToken?: string;
  cache?: KVNamespace | null;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  /** When false, returns {} if KV is empty instead of calling Discord REST. */
  network?: boolean;
}): Promise<ApplicationEmojiCatalog> {
  if (!input.applicationId || !input.botToken) {
    return {};
  }

  const cached = await readCachedApplicationEmojiCatalog(input.cache);
  if (cached) {
    return cached;
  }

  if (input.network === false) {
    return {};
  }

  const rest = new DiscordRestClient(input.botToken, input.fetcher, input.apiBaseUrl);
  const result = await rest.listApplicationEmojis(input.applicationId);

  if (result.isErr()) {
    logger.warn("discord.emoji.fetch_failed", "Failed to fetch application emojis", {
      applicationId: input.applicationId,
      error: result.error,
    });
    return {};
  }

  const entries = normalizeFetchedEmojiCatalog(result.value);
  if (!entries) {
    logger.warn("discord.emoji.fetch_invalid", "Discord returned an invalid emoji payload", {
      applicationId: input.applicationId,
    });
    return {};
  }

  await writeCachedApplicationEmojiCatalog(input.cache, entries);
  return entries;
}

export function formatApplicationEmoji(
  catalog: ApplicationEmojiCatalog | null | undefined,
  name: AppEmojiName,
): string | null {
  const entry = catalog?.[name];
  if (!entry) {
    return null;
  }

  return entry.animated ? `<a:${entry.name}:${entry.id}>` : `<:${entry.name}:${entry.id}>`;
}

export function toComponentEmoji(
  catalog: ApplicationEmojiCatalog | null | undefined,
  name: AppEmojiName,
): APIMessageComponentEmoji | null {
  const entry = catalog?.[name];
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    name: entry.name,
    animated: entry.animated,
  };
}
