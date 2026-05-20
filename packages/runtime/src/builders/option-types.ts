import type { SlashCommandSubcommand } from "./subcommand.js";
import type { SlashCommandSubcommandGroup } from "./subcommand-group.js";
import type { SlashCommandIntegerOption } from "./integer-option.js";
import type { SlashCommandNumberOption } from "./number-option.js";
import type { SlashCommandUserOption } from "./user-option.js";
import type { SlashCommandChannelOption } from "./channel-option.js";
import type { SlashCommandRoleOption } from "./role-option.js";
import type { SlashCommandMentionableOption } from "./mentionable-option.js";
import type { SlashCommandAttachmentOption } from "./attachment-option.js";

export type SlashOptionBuilder =
  | SlashCommandAttachmentOption
  | SlashCommandChannelOption
  | SlashCommandIntegerOption
  | SlashCommandMentionableOption
  | SlashCommandNumberOption
  | SlashCommandRoleOption
  | SlashCommandUserOption
  | SlashCommandSubcommand
  | SlashCommandSubcommandGroup;