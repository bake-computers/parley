import type { KVNamespace } from "@cloudflare/workers-types";
import {
  resolveApplicationEmojiCatalog,
  type ApplicationEmojiCatalog,
  type DiscordRequestContext,
} from "@parley/runtime";

const EMOJI_CONTEXT_KEY = "application-emojis";

type EmojiInteraction = {
  context: DiscordRequestContext;
};

/** Resolves app emojis via the runtime: KV cache → Discord REST → normalized catalog. */
export async function resolveEmojis(interaction: EmojiInteraction): Promise<ApplicationEmojiCatalog> {
  const cached = interaction.context.get<ApplicationEmojiCatalog>(EMOJI_CONTEXT_KEY);
  if (cached) {
    return cached;
  }

  const env = interaction.context.env;
  const catalog = await resolveApplicationEmojiCatalog({
    ...(env.DISCORD_APPLICATION_ID != null && { applicationId: env.DISCORD_APPLICATION_ID }),
    ...(env.DISCORD_BOT_TOKEN != null && { botToken: env.DISCORD_BOT_TOKEN }),
    cache: (env as { KV?: KVNamespace }).KV ?? null,
    network: true,
  });

  interaction.context.set(EMOJI_CONTEXT_KEY, catalog);
  return catalog;
}
