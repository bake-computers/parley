import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  formatApplicationEmoji,
  type ApplicationEmojiCatalog,
  type ChatInputCommandInteraction,
  type DiscordRequestContext,
  type MessageComponentInteraction,
  type ModalInteraction,
} from "@parley/runtime";
import type { UserSettingsResponse, UserSettings as ProtoUserSettings } from "@parley/proto";
import { getUserSettingsClient } from "../../transport.js";
import { UI_TOKENS } from "../../ui/tokens.js";
import { COMPONENTS_V2_EPHEMERAL } from "../../ui/discord.js";

export const ACCEPT_BUTTON = "user/accept-terms";

export function acceptCustomId(sourceCommand: string): string {
  return `${ACCEPT_BUTTON}/${sourceCommand}`;
}

export function parseAcceptSource(customId: string): string {
  if (customId === ACCEPT_BUTTON) {
    return "user";
  }
  const prefix = `${ACCEPT_BUTTON}/`;
  if (customId.startsWith(prefix)) {
    return customId.slice(prefix.length) || "user";
  }
  return "user";
}

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

export function refreshSettingsCache(
  interaction: GatedInteraction,
  settings: ProtoUserSettings,
): void {
  const ctx = interaction.context as DiscordRequestContext;
  const discordUserId = interaction.user?.id ?? "";
  ctx.set(SETTINGS_CACHE_KEY(discordUserId), { at: Date.now(), value: settings });
}

export function buildAcceptanceCard(
  emojis: ApplicationEmojiCatalog,
  sourceCommand = "user",
): ContainerBuilder {
  const pin = formatApplicationEmoji(emojis, "pin");
  const title_text = "**Welcome to Parley**";
  const title = pin ? `${pin} ${title_text}` : `${title_text}`;

  const acceptButton = new ButtonBuilder()
    .setCustomId(acceptCustomId(sourceCommand))
    .setLabel("Accept & Continue")
    .setStyle(BUTTON_STYLE_SECONDARY);

  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(title),
      new TextDisplayBuilder().setContent(
        "To track your MMR, build your competitive stats, and power our ranked queues and tournaments, Parley needs to link your Discord to your Ubisoft account.",
      ),
      new TextDisplayBuilder().setContent(
        "By clicking below, you agree to our [Terms of Service](https://parley.bot/terms) and [Privacy Policy](https://parley.bot/privacy).",
      ),
      new ActionRowBuilder().addComponents(acceptButton),
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
  let response: UserSettingsResponse | undefined;
  try {
    response = await client.getUserSettings({ discordUserId } as never);
  } catch (cause: unknown) {
    console.warn("user_settings.fetch_failed", cause);
    return undefined;
  }

  if (!response.success) {
    console.warn(
      "user_settings.fetch_failed",
      response.error?.message ?? "engine returned success=false",
    );
    return undefined;
  }

  const settings = response.settings;
  if (!settings) {
    console.warn("user_settings.fetch_failed: empty settings payload");
    return undefined;
  }

  ctx.set(cacheKey, { at: Date.now(), value: settings });
  return settings;
}

function defaultClient(env: unknown): GetUserSettingsClient {
  return getUserSettingsClient(env as never) as unknown as GetUserSettingsClient;
}

function isSlashCommand(interaction: GatedInteraction): interaction is ChatInputCommandInteraction {
  return "commandName" in interaction;
}

export async function assertAccepted(
  interaction: GatedInteraction,
  env: unknown,
  injectedClient?: GetUserSettingsClient,
  sourceCommand?: string,
): Promise<boolean> {
  const discordUserId = interaction.user?.id;
  if (!discordUserId) {
    return true;
  }

  // Discord requires an initial response within 3s. Defer slash commands before
  // the settings RPC so hot-reload / VPC latency doesn't trigger a timeout.
  const slash = isSlashCommand(interaction);
  if (slash && !interaction.deferred && !interaction.replied) {
    await interaction.deferReply(true);
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
    // Fail open when the engine is unreachable so dev without the Go binary still works.
    return true;
  }

  if ((settings.termsAcceptedAtMs ?? 0) > 0) {
    return true;
  }

  const source = sourceCommand ?? (isSlashCommand(interaction) ? interaction.commandName : "user");

  const acceptancePayload = {
    components: [buildAcceptanceCard({}, source).toJSON()],
    flags: COMPONENTS_V2_EPHEMERAL,
  };

  if (slash && interaction.deferred) {
    await interaction.editReply(acceptancePayload);
  } else {
    await interaction.reply(acceptancePayload, true);
  }
  return false;
}
