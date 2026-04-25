import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  type APIApplicationCommandInteractionDataOption,
  type APIApplicationCommandOptionChoice,
  type APIInteractionDataResolved,
  type APIInteractionDataResolvedChannel,
  type APIRole,
  type APIUser,
  type ChannelType,
  type Snowflake,
} from "discord-api-types/v10";
import { SlashCommandOptionContainer } from "./builders";
import type {
  AutocompleteHandlerFunction,
  CommandHandlerFunction,
  DiscordRequestContext,
  JsonObject,
} from "./types";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  CommandInteraction,
  MessageComponentInteraction,
  ModalInteraction,
} from "./interactions";

export enum ContextCommandType {
  User = ApplicationCommandType.User,
  Message = ApplicationCommandType.Message,
}

type ResolvedSelectedGuildMember = Record<string, unknown> & {
  user?: APIUser;
};

function collectionFromRecord<T>(value: Record<string, T> | undefined): Map<string, T> {
  return new Map(Object.entries(value ?? {}));
}

function requireOption(
  option: APIApplicationCommandInteractionDataOption | undefined,
  name: string,
  required: boolean,
): APIApplicationCommandInteractionDataOption | null {
  if (!option) {
    if (required) {
      throw new TypeError("Option not found", { cause: { name } });
    }
    return null;
  }

  return option;
}

export interface AutocompleteFocusedOption {
  name: string;
  type: ApplicationCommandOptionType;
  value: string | number | boolean;
  focused: boolean;
}

export class CommandInteractionOptionResolver {
  private group: string | null = null;
  private subcommand: string | null = null;
  private hoistedOptions: APIApplicationCommandInteractionDataOption[];
  private channels: Map<string, APIInteractionDataResolvedChannel>;
  private members: Map<string, ResolvedSelectedGuildMember>;
  private roles: Map<string, APIRole>;
  private users: Map<string, APIUser>;
  private attachments: Map<string, unknown>;

  constructor(
    options: APIApplicationCommandInteractionDataOption[] | undefined,
    resolved: APIInteractionDataResolved | undefined,
  ) {
    this.hoistedOptions = options ?? [];
    this.channels = collectionFromRecord(resolved?.channels);
    this.roles = collectionFromRecord(resolved?.roles);
    this.users = collectionFromRecord(resolved?.users);
    this.attachments = collectionFromRecord(resolved?.attachments);
    this.members = new Map(
      Object.entries(resolved?.members ?? {}).map(([id, member]) => [
        id,
        {
          ...member,
          user: resolved?.users?.[id],
        },
      ]),
    );

    const first = this.hoistedOptions[0];
    if (first?.type === ApplicationCommandOptionType.SubcommandGroup) {
      this.group = first.name;
      this.hoistedOptions = first.options ?? [];
    }

    const next = this.hoistedOptions[0];
    if (next?.type === ApplicationCommandOptionType.Subcommand) {
      this.subcommand = next.name;
      this.hoistedOptions = next.options ?? [];
    }
  }

  get data(): APIApplicationCommandInteractionDataOption[] {
    return this.hoistedOptions;
  }

  get<T extends ApplicationCommandOptionType>(
    name: string,
    type: T,
    required = false,
  ): (APIApplicationCommandInteractionDataOption & { type: T }) | null {
    const option = requireOption(
      this.hoistedOptions.find((item) => item.name === name),
      name,
      required,
    );
    if (!option) {
      return null;
    }
    if (option.type !== type) {
      throw new TypeError("Option type mismatch", {
        cause: { name, type: option.type, expected: type },
      });
    }
    return option as APIApplicationCommandInteractionDataOption & { type: T };
  }

  getSubcommand(required = true): string | null {
    if (required && !this.subcommand) {
      throw new TypeError("No subcommand selected");
    }
    return this.subcommand;
  }

  getSubcommandGroup(required = false): string | null {
    if (required && !this.group) {
      throw new TypeError("No subcommand group selected");
    }
    return this.group;
  }

  getFocused(): AutocompleteFocusedOption | null {
    const focused = this.hoistedOptions.find((option) => "focused" in option && option.focused);
    if (!focused || !("value" in focused)) {
      return null;
    }

    return {
      name: focused.name,
      type: focused.type,
      value: focused.value,
      focused: true,
    };
  }

  getBoolean(name: string, required = false): boolean | null {
    return this.get(name, ApplicationCommandOptionType.Boolean, required)?.value ?? null;
  }

  getString<T extends string = string>(name: string, required = false): T | null {
    return (this.get(name, ApplicationCommandOptionType.String, required)?.value as T) ?? null;
  }

  getInteger(name: string, required = false): number | null {
    const value = this.get(name, ApplicationCommandOptionType.Integer, required)?.value;
    return typeof value === "number" ? value : null;
  }

  getNumber(name: string, required = false): number | null {
    const value = this.get(name, ApplicationCommandOptionType.Number, required)?.value;
    return typeof value === "number" ? value : null;
  }

  getChannel(
    name: string,
    required = false,
    channelTypes: ChannelType[] = [],
  ): APIInteractionDataResolvedChannel | null {
    const option = this.get(name, ApplicationCommandOptionType.Channel, required);
    const channel = option ? (this.channels.get(option.value as Snowflake) ?? null) : null;
    if (channel && channelTypes.length > 0 && !channelTypes.includes(channel.type)) {
      throw new TypeError("Invalid channel type", {
        cause: { name, type: channel.type, expected: channelTypes.join(", ") },
      });
    }
    return channel;
  }

  getUser(name: string, required = false): APIUser | null {
    const option = this.get(name, ApplicationCommandOptionType.User, required);
    return option ? (this.users.get(option.value as Snowflake) ?? null) : null;
  }

  getMember(name: string, required = false): ResolvedSelectedGuildMember | null {
    const option = this.get(name, ApplicationCommandOptionType.User, required);
    return option ? (this.members.get(option.value as Snowflake) ?? null) : null;
  }

  getRole(name: string, required = false): APIRole | null {
    const option = this.get(name, ApplicationCommandOptionType.Role, required);
    return option ? (this.roles.get(option.value as Snowflake) ?? null) : null;
  }

  getAttachment<T = unknown>(name: string, required = false): T | null {
    const option = this.get(name, ApplicationCommandOptionType.Attachment, required);
    return option
      ? ((this.attachments.get(option.value as Snowflake) as T | undefined) ?? null)
      : null;
  }

  getMentionable(
    name: string,
    required = false,
  ): ResolvedSelectedGuildMember | APIUser | APIRole | null {
    const option = this.get(name, ApplicationCommandOptionType.Mentionable, required);
    if (!option) {
      return null;
    }

    const id = option.value as Snowflake;
    return this.members.get(id) ?? this.users.get(id) ?? this.roles.get(id) ?? null;
  }
}

export interface ModalFieldData {
  custom_id: string;
  type: ComponentType;
  value?: string;
  values?: string[];
}

export class ModalComponentResolver {
  private fields: ModalFieldData[] = [];

  constructor(components: readonly unknown[]) {
    for (const row of components) {
      if (!row || typeof row !== "object" || !("components" in row)) {
        continue;
      }
      const rowComponents = (row as { components?: unknown }).components;
      if (!Array.isArray(rowComponents)) {
        continue;
      }
      for (const component of rowComponents) {
        if (!component || typeof component !== "object" || !("custom_id" in component)) {
          continue;
        }
        this.fields.push(component as ModalFieldData);
      }
    }
  }

  get data(): ModalFieldData[] {
    return this.fields;
  }

  fieldExists(customId: string): boolean {
    return this.fields.some((field) => field.custom_id === customId);
  }

  getComponent(customId: string): ModalFieldData {
    const component = this.fields.find((field) => field.custom_id === customId);
    if (!component) {
      throw new TypeError("Modal component not found", { cause: { customId } });
    }
    return component;
  }

  getString(customId: string, required = false): string | null {
    const component = this.fields.find((field) => field.custom_id === customId);
    if (!component) {
      if (required) {
        throw new TypeError("Modal text input not found", { cause: { customId } });
      }
      return null;
    }
    return typeof component.value === "string" ? component.value : null;
  }

  getSelectedValues(customId: string, required = false): readonly string[] | null {
    const component = this.fields.find((field) => field.custom_id === customId);
    if (!component) {
      if (required) {
        throw new TypeError("Modal select input not found", { cause: { customId } });
      }
      return null;
    }
    return component.values ?? null;
  }
}

export function parseCustomId(
  customId: string,
  onlyPrefix = false,
): string | { path: string[]; params: URLSearchParams } {
  if (onlyPrefix) {
    const match = customId.match(/^(.+?)(\/|\?)/i);
    return match ? (match[1] ?? customId) : customId;
  }

  const [pathValue, paramsValue] = customId.split("?");
  return {
    path: (pathValue ?? "").split("/").filter(Boolean),
    params: new URLSearchParams(paramsValue ?? ""),
  };
}

export class SlashCommand extends SlashCommandOptionContainer {
  readonly handlerType = "slash" as const;
  readonly guildIds = new Set<string>();
  name = "";
  private description = "";
  private handlerFn?: CommandHandlerFunction<ChatInputCommandInteraction>;
  private autocompleteFn?: AutocompleteHandlerFunction<AutocompleteInteraction>;

  setName(name: string): this {
    this.name = name;
    return this;
  }

  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  isGuildCommand(): boolean {
    return this.guildIds.size > 0;
  }

  setGuildIds(guildIds: Iterable<string>): this {
    this.guildIds.clear();
    for (const guildId of guildIds) {
      this.guildIds.add(guildId);
    }
    return this;
  }

  addGuildIds(...guildIds: string[]): this {
    for (const guildId of guildIds) {
      this.guildIds.add(guildId);
    }
    return this;
  }

  removeGuildIds(...guildIds: string[]): this {
    for (const guildId of guildIds) {
      this.guildIds.delete(guildId);
    }
    return this;
  }

  addHandler(handler: CommandHandlerFunction<ChatInputCommandInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  addAutocompleteHandler(handler: AutocompleteHandlerFunction<AutocompleteInteraction>): this {
    this.autocompleteFn = handler;
    return this;
  }

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Command "${this.name}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }

  async executeAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!this.autocompleteFn) {
      throw new Error(`Command "${this.name}" does not have an autocomplete handler`);
    }
    await this.autocompleteFn(interaction);
  }

  toJSON(): JsonObject {
    return {
      name: this.name,
      description: this.description,
      type: ApplicationCommandType.ChatInput,
      ...(this.getOptionsJson().length > 0 ? { options: this.getOptionsJson() } : {}),
    };
  }
}

export class ContextCommand {
  readonly handlerType = "context" as const;
  readonly guildIds = new Set<string>();
  name = "";
  private handlerFn?: CommandHandlerFunction<CommandInteraction>;

  constructor(private readonly commandType: ContextCommandType) {}

  setName(name: string): this {
    this.name = name;
    return this;
  }

  isGuildCommand(): boolean {
    return this.guildIds.size > 0;
  }

  setGuildIds(guildIds: Iterable<string>): this {
    this.guildIds.clear();
    for (const guildId of guildIds) {
      this.guildIds.add(guildId);
    }
    return this;
  }

  addGuildIds(...guildIds: string[]): this {
    for (const guildId of guildIds) {
      this.guildIds.add(guildId);
    }
    return this;
  }

  addHandler(handler: CommandHandlerFunction<CommandInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  async execute(interaction: CommandInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Context command "${this.name}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }

  toJSON(): JsonObject {
    return {
      name: this.name,
      type: this.commandType,
    };
  }
}

export class ComponentHandler {
  readonly handlerType = "component" as const;
  private handlerFn?: CommandHandlerFunction<MessageComponentInteraction>;

  constructor(
    readonly prefix: string,
    readonly componentType: ComponentType,
    handler?: CommandHandlerFunction<MessageComponentInteraction>,
  ) {
    if (!prefix) {
      throw new TypeError("Component handler prefix must be non-empty");
    }
    this.handlerFn = handler;
  }

  addHandler(handler: CommandHandlerFunction<MessageComponentInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  matches(customId: string): boolean {
    return parseCustomId(customId, true) === this.prefix;
  }

  async execute(interaction: MessageComponentInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Component handler "${this.prefix}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }
}

export class ModalHandler {
  readonly handlerType = "modal" as const;
  private handlerFn?: CommandHandlerFunction<ModalInteraction>;

  constructor(
    readonly prefix: string,
    handler?: CommandHandlerFunction<ModalInteraction>,
  ) {
    if (!prefix) {
      throw new TypeError("Modal handler prefix must be non-empty");
    }
    this.handlerFn = handler;
  }

  addHandler(handler: CommandHandlerFunction<ModalInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  matches(customId: string): boolean {
    return parseCustomId(customId, true) === this.prefix;
  }

  async execute(interaction: ModalInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Modal handler "${this.prefix}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }
}

export class WebhookEventHandler {
  readonly handlerType = "webhook" as const;

  constructor(
    readonly eventType: number,
    private readonly handlerFn: (
      event: unknown,
      context: DiscordRequestContext,
    ) => Promise<Response | void> | Response | void,
  ) {}

  execute(
    event: unknown,
    context: DiscordRequestContext,
  ): Promise<Response | void> | Response | void {
    return this.handlerFn(event, context);
  }
}

export type AnyHandler =
  | SlashCommand
  | ContextCommand
  | ComponentHandler
  | ModalHandler
  | WebhookEventHandler
  | readonly AnyHandler[];

export function flattenHandlers(
  handlers: readonly AnyHandler[],
): (SlashCommand | ContextCommand | ComponentHandler | ModalHandler | WebhookEventHandler)[] {
  return handlers.flatMap((handler) =>
    Array.isArray(handler)
      ? flattenHandlers(handler as readonly AnyHandler[])
      : [
          handler as
            | SlashCommand
            | ContextCommand
            | ComponentHandler
            | ModalHandler
            | WebhookEventHandler,
        ],
  );
}

export function autocompleteChoice<T extends string | number>(
  name: string,
  value: T,
): APIApplicationCommandOptionChoice<T> {
  return { name, value };
}
