import type { KVNamespace } from "@cloudflare/workers-types";
import {
  resolveApplicationEmojiCatalog,
  type ApplicationEmojiCatalog,
  type DiscordRequestContext,
} from "@parley/runtime";

const EMOJI_CONTEXT_KEY = "application-emojis";

type EmojiInteraction = {
  context: DiscordRequestContext;
  applicationId?: string;
};

/**
 * Resolves app emojis via the runtime: Discord REST → normalized catalog.
 *
 * @param {EmojiInteraction} interaction Discord interaction carrying the request-scoped cache and Worker bindings.
 * @returns {Promise<ApplicationEmojiCatalog>} The normalized application emoji catalog, or an empty catalog when unavailable.
 */
export async function resolveEmojis(
  interaction: EmojiInteraction,
): Promise<ApplicationEmojiCatalog> {
  const cached = interaction.context.get<ApplicationEmojiCatalog>(EMOJI_CONTEXT_KEY);
  if (cached) {
    return cached;
  }

  const env = interaction.context.env;
  const applicationId = env.DISCORD_APPLICATION_ID ?? interaction.applicationId;
  const botToken = env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN;
  const cache = (env as { KV?: KVNamespace }).KV ?? null;
  const catalog = await resolveApplicationEmojiCatalog({
    ...(applicationId !== undefined && { applicationId }),
    ...(botToken !== undefined && { botToken }),
    cache,
    network: cache !== null,
  });

  interaction.context.set(EMOJI_CONTEXT_KEY, catalog);
  return catalog;
}
