import { EmbedBuilder } from "@parley/runtime";

const EMBED_SUCCESS_COLOR = 0x22c55e;
const EMBED_ERROR_COLOR = 0xef4444;
const EMBED_INFO_COLOR = 0xffffff;
const EMBED_WARNING_COLOR = 0xf59e0b;

export function createSuccessEmbed(
  title: string,
  description: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(EMBED_SUCCESS_COLOR);
}

export function createErrorEmbed(
  title: string,
  description: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(EMBED_ERROR_COLOR);
}

export function createInfoEmbed(
  title: string,
  description: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(EMBED_INFO_COLOR);
}

export function createWarningEmbed(
  title: string,
  description: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(EMBED_WARNING_COLOR);
}
