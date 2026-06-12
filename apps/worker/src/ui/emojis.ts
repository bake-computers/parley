import type { ApplicationEmojiCatalog, DiscordRequestContext } from "@parley/runtime";

const EMOJI_CONTEXT_KEY = "application-emojis";
const EMPTY_CATALOG: ApplicationEmojiCatalog = {};

type EmojiInteraction = {
  context: DiscordRequestContext;
};

/** UI fallbacks (unicode) are used — no Discord emoji REST or KV lookups. */
export async function resolveEmojis(
  interaction: EmojiInteraction,
): Promise<ApplicationEmojiCatalog> {
  const cached = interaction.context.get<ApplicationEmojiCatalog>(EMOJI_CONTEXT_KEY);
  if (cached) {
    return cached;
  }

  interaction.context.set(EMOJI_CONTEXT_KEY, EMPTY_CATALOG);
  return EMPTY_CATALOG;
}