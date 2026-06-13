import {
  ButtonBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  formatApplicationEmoji,
  type ApplicationEmojiCatalog,
  type ChatInputCommandInteraction,
  type DiscordRequestContext,
  type MessageComponentInteraction,
  type ModalInteraction,
} from "@parley/runtime";
import { UserSettingsService } from "@parley/proto";
import type {
  UserSettingsResponse,
  UserSettings as ProtoUserSettings,
} from "@parley/proto";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { resolveEngineTransport } from "../../engine-transport.js";
import { UI_TOKENS } from "../../ui/tokens.js";

export const ACCEPT_BUTTON = "user/accept-terms";

const SETTINGS_CACHE_KEY = (discordUserId: string): string =>
  `user-settings-cache:${discordUserId}`;

const SETTINGS_CACHE_TTL_MS = 30_000;

const BUTTON_STYLE_SECONDARY = 2;

type GatedInteraction =
  | ChatInputCommandInteraction
  | MessageComponentInteraction
  | ModalInteraction;

type GetUserSettingsClient = {
  getUserSettings: (req: { discordUserId: string }) => Promise<UserSettingsResponse>;
};

export function buildAcceptanceCard(
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
  const pin = formatApplicationEmoji(emojis, "pin");
  const title = pin ? `${pin} **Before you start**` : "**Before you start**";

  const acceptButton = new ButtonBuilder()
    .setCustomId(ACCEPT_BUTTON)
    .setLabel("Accept & Continue")
    .setStyle(BUTTON_STYLE_SECONDARY);

  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(title),
      new TextDisplayBuilder().setContent(
        "Parley links your Discord to your in-game profile and stores match, stats, and tournament data so we can run ranked queues and tournaments.",
      ),
      new TextDisplayBuilder().setContent(
        "By continuing you accept our [Privacy Policy](https://parley.bot/privacy) and [Terms of Service](https://parley.bot/terms).",
      ),
      new SectionBuilder()
        .addText(new TextDisplayBuilder().setContent("Ready to continue?"))
        .setAccessory(acceptButton),
    );
}

async function fetchSettings(
  interaction: GatedInteraction,
  client: GetUserSettingsClient,
): Promise<ProtoUserSettings | undefined> {
  const ctx = interaction.context as DiscordRequestContext;
  const discordUserId = interaction.user?.id ?? "";
  const cacheKey = SETTINGS_CACHE_KEY(discordUserId);
  const cached = ctx.get<{ at: number; value: ProtoUserSettings | undefined }>(cacheKey);
  if (cached && Date.now() - cached.at < SETTINGS_CACHE_TTL_MS) {
    return cached.value;
  }
  const response = await client
    .getUserSettings({ discordUserId } as never)
    .catch(() => undefined);
  const settings = response?.success ? response.settings : undefined;
  ctx.set(cacheKey, { at: Date.now(), value: settings });
  return settings;
}

function defaultClient(env: unknown): GetUserSettingsClient {
  const config = resolveEngineTransport(env as never);
  const transport = createConnectTransport({
    baseUrl: config.baseUrl,
    fetch: config.fetchImpl as typeof fetch,
    jsonOptions: { enumAsInteger: true },
  });
  return createClient(UserSettingsService, transport) as unknown as GetUserSettingsClient;
}

export async function assertAccepted(
  interaction: GatedInteraction,
  env: unknown,
  injectedClient?: GetUserSettingsClient,
): Promise<boolean> {
  const discordUserId = interaction.user?.id;
  if (!discordUserId) {
    return true;
  }

  const client = injectedClient ?? defaultClient(env);

  let settings: ProtoUserSettings | undefined;
  try {
    settings = await fetchSettings(interaction, client);
  } catch (cause: unknown) {
    // Fail open: don't brick the bot when the engine is degraded.
    console.warn("user_settings.fetch_failed", cause);
    return true;
  }

  if (settings === undefined) {
    console.warn("user_settings.fetch_failed: empty response");
    return true;
  }

  if (settings.termsAcceptedAtMs > 0) {
    return true;
  }

  await interaction.reply(
    {
      components: [buildAcceptanceCard({}).toJSON()],
      flags: 64 | 32768,
    },
    true,
  );
  return false;
}
