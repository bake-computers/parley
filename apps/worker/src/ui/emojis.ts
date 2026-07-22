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

/** Resolves app emojis via the runtime: Discord REST → normalized catalog. */
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
  const catalog = await resolveApplicationEmojiCatalog({
    ...(applicationId !== undefined && { applicationId }),
    ...(botToken !== undefined && { botToken }),
    cache: null,
    network: true,
  });

  interaction.context.set(EMOJI_CONTEXT_KEY, catalog);
  return catalog;
}
