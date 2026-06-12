import {
  ButtonBuilder,
  ContainerBuilder,
  formatApplicationEmoji,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  toComponentEmoji,
  type ApplicationEmojiCatalog,
} from "@parley/runtime";

const BUTTON_PRIMARY = 1;
const BUTTON_SECONDARY = 2;
const BUTTON_SUCCESS = 3;
const SEPARATOR_SPACING_SMALL = 1;
import {
  confirmCustomId,
  GAME_NAME,
  PLATFORM_HINTS,
  PLATFORMS,
  platformLabel,
  UI_ERROR_COLOR,
  UI_INFO_COLOR,
  UI_SUCCESS_COLOR,
  UI_WARNING_COLOR,
  type Platform,
} from "./constants.js";

function footerDisplay(): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent("-# Parley");
}

function emojiOrFallback(
  catalog: ApplicationEmojiCatalog,
  name: Parameters<typeof formatApplicationEmoji>[1],
  fallback: string,
): string {
  return formatApplicationEmoji(catalog, name) ?? fallback;
}

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function platformSection(platform: Platform, catalog: ApplicationEmojiCatalog): SectionBuilder {
  const label = platformLabel(platform);
  const hint = PLATFORM_HINTS[platform];

  return new SectionBuilder()
    .addText(new TextDisplayBuilder().setContent(`**${label}**\n${hint}`))
    .setAccessory(
      new ButtonBuilder()
        .setCustomId(`link/platform/${platform}`)
        .setLabel(label)
        .setStyle(BUTTON_PRIMARY)
        .setEmoji(toComponentEmoji(catalog, "link") ?? { name: "🔗" }),
    );
}

export function buildPlatformSelectCard(catalog: ApplicationEmojiCatalog): ContainerBuilder {
  const linkEmoji = emojiOrFallback(catalog, "link", "🔗");

  return new ContainerBuilder()
    .setAccentColor(UI_INFO_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(`${linkEmoji} **Link Your Account**`),
      new TextDisplayBuilder().setContent(
        `Connect your Discord to **${GAME_NAME}**. Choose your platform to begin.`,
      ),
      separator(),
      ...PLATFORMS.map((platform) => platformSection(platform, catalog)),
      separator(),
      footerDisplay(),
    );
}

export function buildUsernamePromptCard(
  platform: Platform,
  catalog: ApplicationEmojiCatalog,
  wizardMessageId?: string,
): ContainerBuilder {
  const infoEmoji = emojiOrFallback(catalog, "information", "ℹ️");
  const label = platformLabel(platform);

  return new ContainerBuilder().setAccentColor(UI_INFO_COLOR).addComponents(
    new TextDisplayBuilder().setContent(`${infoEmoji} **Enter Username**`),
    new TextDisplayBuilder().setContent(`Platform: **${label}**`),
    separator(),
    new TextDisplayBuilder().setContent("Click below to enter your in-game username."),
    new SectionBuilder()
      .addText(
        new TextDisplayBuilder().setContent(
          `Your **${GAME_NAME}** username will be verified before linking.`,
        ),
      )
      .setAccessory(
        new ButtonBuilder()
          .setCustomId(
            wizardMessageId
              ? `link/username/${platform}/${wizardMessageId}`
              : `link/username/${platform}`,
          )
          .setLabel("Enter Username")
          .setStyle(BUTTON_PRIMARY)
          .setEmoji(toComponentEmoji(catalog, "letter") ?? { name: "✏️" }),
      ),
    footerDisplay(),
  );
}

export function buildConfirmCard(
  platform: Platform,
  username: string,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const warningEmoji = emojiOrFallback(catalog, "warning", "⚠️");
  const label = platformLabel(platform);
  const confirmId = confirmCustomId(platform, username);

  return new ContainerBuilder().setAccentColor(UI_WARNING_COLOR).addComponents(
    new TextDisplayBuilder().setContent(`${warningEmoji} **Confirm Your Account**`),
    new TextDisplayBuilder().setContent("Please verify these details are correct before linking."),
    separator(),
    new SectionBuilder().addText(
      new TextDisplayBuilder().setContent(`**Username**\n\`${username}\``),
      new TextDisplayBuilder().setContent(`**Platform**\n${label}`),
      new TextDisplayBuilder().setContent(`**Game**\n${GAME_NAME}`),
    ),
    separator(),
    new SectionBuilder()
      .addText(new TextDisplayBuilder().setContent("Ready to link this account to your Discord?"))
      .setAccessory(
        new ButtonBuilder()
          .setCustomId(confirmId)
          .setLabel("Confirm")
          .setStyle(BUTTON_SUCCESS)
          .setEmoji(toComponentEmoji(catalog, "confirm") ?? { name: "✅" }),
      ),
    new SectionBuilder()
      .addText(new TextDisplayBuilder().setContent("Need to start over?"))
      .setAccessory(
        new ButtonBuilder()
          .setCustomId("link/cancel")
          .setLabel("Cancel")
          .setStyle(BUTTON_SECONDARY)
          .setEmoji(toComponentEmoji(catalog, "cancel") ?? { name: "✖️" }),
      ),
    footerDisplay(),
  );
}

export function buildSuccessCard(
  usernameNormalized: string,
  playerId: number,
  platform: Platform,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const confirmEmoji = emojiOrFallback(catalog, "confirm", "✅");
  const label = platformLabel(platform);

  return new ContainerBuilder()
    .setAccentColor(UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(`${confirmEmoji} **Account Linked**`),
      separator(),
      new TextDisplayBuilder().setContent(`### ${GAME_NAME}`),
      new SectionBuilder().addText(
        new TextDisplayBuilder().setContent(`**Username**\n\`${usernameNormalized}\``),
        new TextDisplayBuilder().setContent(`**Player ID**\n\`${playerId}\``),
        new TextDisplayBuilder().setContent(`**Platform**\n${label}`),
      ),
      footerDisplay(),
    );
}

export function buildErrorCard(
  message: string,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const cancelEmoji = emojiOrFallback(catalog, "cancel", "❌");

  return new ContainerBuilder()
    .setAccentColor(UI_ERROR_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(`${cancelEmoji} **Link Failed**`),
      separator(),
      new TextDisplayBuilder().setContent(message),
      footerDisplay(),
    );
}
