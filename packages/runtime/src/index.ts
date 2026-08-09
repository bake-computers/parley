// Types
export type {
  DiscordRuntimeEnv,
  DiscordRequestContext,
  DiscordApiError,
  ResponseInput,
  ModalInput,
  MiddlewareFunction,
  CommandHandlerFunction,
  AutocompleteHandlerFunction,
  CommandRegistrationData,
  RegisterableCommand,
  AnyInteraction,
  RegisterSummary,
  RegisterOptions,
  AutocompleteChoice,
  InteractionMessage,
  PartialCurrentUserGuild,
  JsonPrimitive,
  JsonObject,
  JsonValue,
} from "./types/index.js";

// Result
export { ok, err, type Result, Ok, Err } from "./result.js";

// Client
export { ParleyClient } from "./client.js";

// Builders
export {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  SeparatorBuilder,
  ContainerBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  TextInputBuilder,
  ModalBuilder,
  SlashCommandStringOption,
  SlashCommandIntegerOption,
  SlashCommandNumberOption,
  SlashCommandBooleanOption,
  SlashCommandUserOption,
  SlashCommandRoleOption,
  SlashCommandMentionableOption,
  SlashCommandAttachmentOption,
  SlashCommandChannelOption,
  SlashCommandSubcommand,
  SlashCommandSubcommandGroup,
  SlashCommandOptionContainer,
  isJSONEncodable,
  type JSONEncodable,
} from "./builders/index.js";

// Interactions
export {
  BaseInteraction,
  ModalCapableInteraction,
  CommandInteraction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageComponentInteraction,
  ButtonInteraction,
  StringSelectInteraction,
  UserSelectInteraction,
  RoleSelectInteraction,
  MentionableSelectInteraction,
  ChannelSelectInteraction,
  ModalInteraction,
  INITIAL_RESPONSE_CONTEXT_KEY,
  INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY,
  type InteractionResponseOptions,
} from "./interactions/index.js";

// Handlers
export {
  SlashCommand,
  ContextCommand,
  ContextCommandType,
  ComponentHandler,
  ModalHandler,
  WebhookEventHandler,
  CommandInteractionOptionResolver,
  ModalComponentResolver,
  flattenHandlers,
  parseCustomId,
  isSlashCommandHandler,
  isContextCommandHandler,
  isRegisterableApplicationCommand,
  type AnyHandler,
  type AutocompleteFocusedOption,
  type ModalFieldData,
} from "./utils/handlers/index.js";

// Register
export { registerApplicationCommands, registerApplicationCommandsWithOptions } from "./register.js";

// REST
export { discordRequest, DiscordRestClient, type DiscordRequestOptions } from "./rest.js";

// Logger
export {
  logger,
  log,
  configureLogSink,
  resetLogSink,
  setLogSinkForTests,
  type LogLevel,
  type LogFields,
  type LogRecord,
  type SerializedError,
} from "./utils/logger.js";

// Verify
export {
  verifyDiscordRequest,
  type VerifyDiscordRequestError,
  type VerifiedDiscordRequest,
} from "./utils/verify.js";
