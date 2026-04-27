import {
  type ActionRowBuilder,
  type AppEmojiName,
  type ApplicationEmojiCatalog,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  formatApplicationEmoji,
} from "@parley/discord-runtime";

export type NoticeTone = "danger" | "info" | "primary" | "success" | "warning";

export const COMPONENTS_V2_FLAGS = MessageFlags.IsComponentsV2;
export const EPHEMERAL_COMPONENTS_V2_FLAGS = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

export const UI_ACCENT_COLORS: Record<NoticeTone, number> = {
  danger: 0xb91c1c,
  info: 0x334155,
  primary: 0x1d4ed8,
  success: 0x0f766e,
  warning: 0xb45309,
};

export function buildTextBlock(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function buildSummaryBlock(label: string, value: string): TextDisplayBuilder {
  return buildTextBlock(`**${label}**\n${value}`);
}

export function buildDivider(
  spacing = SeparatorSpacingSize.Small,
  divider = false,
): SeparatorBuilder {
  return new SeparatorBuilder().setSpacing(spacing).setDivider(divider);
}

export function prefixWithEmoji(
  title: string,
  emojis: ApplicationEmojiCatalog | null | undefined,
  emojiName?: AppEmojiName,
): string {
  if (!emojiName) {
    return title;
  }

  const emoji = formatApplicationEmoji(emojis, emojiName);
  return emoji ? `${emoji} ${title}` : title;
}

export function buildCardTitle(
  title: string,
  emojis: ApplicationEmojiCatalog | null | undefined,
  emojiName?: AppEmojiName,
): TextDisplayBuilder {
  return buildTextBlock(`## ${prefixWithEmoji(title, emojis, emojiName)}`);
}

export function buildNoticeCard(input: {
  title: string;
  message: string;
  tone: NoticeTone;
  emojis?: ApplicationEmojiCatalog | null;
  emojiName?: AppEmojiName;
  details?: string[];
  actionRows?: ActionRowBuilder[];
}): ContainerBuilder {
  const card = new ContainerBuilder().setAccentColor(UI_ACCENT_COLORS[input.tone]);
  card.addComponents(buildCardTitle(input.title, input.emojis, input.emojiName));

  if (input.message.trim()) {
    card.addComponents(buildTextBlock(input.message));
  }

  for (const detail of input.details ?? []) {
    if (detail.trim()) {
      card.addComponents(buildTextBlock(detail));
    }
  }

  const actionRows = input.actionRows ?? [];
  if (actionRows.length > 0) {
    card.addComponents(buildDivider());
    card.addComponents(...actionRows);
  }

  return card;
}

export function buildComponentsV2Reply(
  components: ContainerBuilder[],
  ephemeral = true,
): {
  components: ContainerBuilder[];
  flags: number;
} {
  return {
    components,
    flags: ephemeral ? EPHEMERAL_COMPONENTS_V2_FLAGS : COMPONENTS_V2_FLAGS,
  };
}
