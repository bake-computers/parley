import type { ApplicationEmojiCatalog, DiscordRequestContext } from "@parley/runtime";
import { PARLEY_EMOJI_CATALOG } from "#/ui/constants";

const EMOJI_CONTEXT_KEY = "application-emojis";

type EmojiInteraction = {
  context: DiscordRequestContext;
  applicationId?: string;
};

/**
 * Returns the statically configured application emoji catalog.
 *
 * @param {EmojiInteraction} interaction Discord interaction carrying the request-scoped cache and Worker bindings.
 * @returns {ApplicationEmojiCatalog} The current catalog without a Discord REST request.
 */
export function resolveEmojis(interaction: EmojiInteraction): ApplicationEmojiCatalog {
  const cached = interaction.context.get<ApplicationEmojiCatalog>(EMOJI_CONTEXT_KEY);
  if (cached) {
    return cached;
  }

  interaction.context.set(EMOJI_CONTEXT_KEY, PARLEY_EMOJI_CATALOG);
  return PARLEY_EMOJI_CATALOG;
}
