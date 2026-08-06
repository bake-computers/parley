import type { KVNamespace } from "@cloudflare/workers-types";
import {
  resolveApplicationEmojiCatalog,
  type ApplicationEmojiCatalog,
  type DiscordRequestContext,
} from "@parley/runtime";

const EMOJI_CONTEXT_KEY = "application-emojis";
const IN_MEMORY_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const inMemoryCatalogs = new Map<string, { catalog: ApplicationEmojiCatalog; expiresAt: number }>();
const inFlightRefreshes = new Map<string, Promise<void>>();

type EmojiInteraction = {
  context: DiscordRequestContext;
  applicationId?: string;
};

/**
 * Resolves app emojis via the runtime: Discord REST → normalized catalog.
 *
 * @param {EmojiInteraction} interaction Discord interaction carrying the request-scoped cache and Worker bindings.
 * @returns {ApplicationEmojiCatalog} The current catalog, or an empty catalog while a background refresh runs.
 */
export function resolveEmojis(interaction: EmojiInteraction): ApplicationEmojiCatalog {
  const cached = interaction.context.get<ApplicationEmojiCatalog>(EMOJI_CONTEXT_KEY);
  if (cached) {
    return cached;
  }

  const env = interaction.context.env;
  const applicationId = env.DISCORD_APPLICATION_ID ?? interaction.applicationId;
  const botToken = env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN;
  if (!applicationId || !botToken) {
    interaction.context.set(EMOJI_CONTEXT_KEY, {});
    return {};
  }

  const inMemory = inMemoryCatalogs.get(applicationId);
  if (inMemory && inMemory.expiresAt > Date.now()) {
    interaction.context.set(EMOJI_CONTEXT_KEY, inMemory.catalog);
    return inMemory.catalog;
  }
  if (inMemory) {
    inMemoryCatalogs.delete(applicationId);
  }

  const cache = (env as { KV?: KVNamespace }).KV ?? null;
  if (!inFlightRefreshes.has(applicationId)) {
    const refresh = resolveApplicationEmojiCatalog({
      applicationId,
      botToken,
      cache,
      network: cache !== null,
    })
      .then((catalog) => {
        if (Object.keys(catalog).length > 0) {
          inMemoryCatalogs.set(applicationId, {
            catalog,
            expiresAt: Date.now() + IN_MEMORY_CATALOG_TTL_MS,
          });
        }
        return undefined;
      })
      .catch(() => {
        // The resolver logs the actionable REST/KV failure. Optional UI emoji
        // decoration must never delay or fail the interaction response.
      });
    inFlightRefreshes.set(
      applicationId,
      refresh.finally(() => inFlightRefreshes.delete(applicationId)),
    );
  }

  const refresh = inFlightRefreshes.get(applicationId);
  if (refresh) {
    interaction.context.waitUntil(refresh);
  }
  const fallback: ApplicationEmojiCatalog = {};
  interaction.context.set(EMOJI_CONTEXT_KEY, fallback);
  return fallback;
}
