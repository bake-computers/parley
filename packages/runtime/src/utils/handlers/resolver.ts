import {
  ApplicationCommandOptionType,
  type APIApplicationCommandInteractionDataOption,
  type APIInteractionDataResolved,
  type APIInteractionDataResolvedChannel,
  type APIRole,
  type APIUser,
  type ChannelType,
  type Snowflake,
} from "discord-api-types/v10";
import type { ResolvedSelectedGuildMember } from "./types.js";

/**
 * Converts a plain record into a `Map`, short-circuiting when the value is
 * `undefined` to avoid allocating an intermediate entries array.
 *
 * @param {Record<string, T> | undefined} value - The record to convert, or `undefined`.
 * @returns {Map<string, T>} A `Map` containing the same key-value pairs, or an empty `Map`.
 */
export function collectionFromRecord<T>(value: Record<string, T> | undefined): Map<string, T> {
  if (!value) {
    return new Map();
  }
  return new Map(Object.entries(value));
}

/**
 * Asserts that an option exists when it is required, returning it (or `null`
 * when optional and not present).
 *
 * @param {APIApplicationCommandInteractionDataOption | undefined} option - The option data to check.
 * @param {string} name - The option name, used in the error message.
 * @param {boolean} required - Whether the option must be present.
 * @returns {APIApplicationCommandInteractionDataOption | null} The option if it exists, or `null` if it is absent and optional.
 * @throws {TypeError} When `required` is `true` and `option` is `undefined`.
 */
export function requireOption(
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

/**
 * Represents the currently focused option inside an autocomplete interaction.
 * Discord sends exactly one option with `focused: true` per autocomplete event.
 */
export interface AutocompleteFocusedOption {
  /** The name of the focused option. */
  name: string;
  /** The Discord option type (string, integer, number, etc.). */
  type: ApplicationCommandOptionType;
  /** The partial value the user has typed so far. */
  value: string | number | boolean;
  /** Always `true`; present for structural consistency with option data. */
  focused: boolean;
}

/**
 * Resolves typed values from the raw option data of a slash-command interaction.
 *
 * All options after subcommand/subcommand-group unwrapping are stored in a
 * `Map` at construction time so every `get*()` call is O(1) rather than O(n).
 * The focused autocomplete option is also captured once during construction.
 *
 * @example
 * ```ts
 * const resolver = new CommandInteractionOptionResolver(interaction.data.options, interaction.data.resolved);
 * const query = resolver.getString("query", true); // required string option
 * const limit = resolver.getInteger("limit");      // optional integer option
 * ```
 */
export class CommandInteractionOptionResolver {
  /** The active subcommand group name, or `null` if none was selected. */
  private group: string | null = null;

  /** The active subcommand name, or `null` if none was selected. */
  private subcommand: string | null = null;

  /**
   * The "hoisted" options array — the leaf-level options after subcommand and
   * subcommand-group wrappers have been unwrapped.
   */
  private hoistedOptions: APIApplicationCommandInteractionDataOption[];

  /**
   * Index of hoisted options by name for O(1) lookups.
   * Populated in a single pass at the end of the constructor.
   */
  private hoistedOptionsMap: Map<string, APIApplicationCommandInteractionDataOption> = new Map();

  /** Resolved channel objects keyed by Snowflake ID. */
  private channels: Map<string, APIInteractionDataResolvedChannel>;

  /** Resolved guild members (with embedded user) keyed by Snowflake ID. */
  private members: Map<string, ResolvedSelectedGuildMember>;

  /** Resolved role objects keyed by Snowflake ID. */
  private roles: Map<string, APIRole>;

  /** Resolved user objects keyed by Snowflake ID. */
  private users: Map<string, APIUser>;

  /** Resolved attachment objects keyed by Snowflake ID. */
  private attachments: Map<string, unknown>;

  /**
   * The focused autocomplete option captured during construction, or `null` if
   * this is not an autocomplete interaction or no option is focused.
   */
  private focusedOption: AutocompleteFocusedOption | null = null;

  /**
   * @param {APIApplicationCommandInteractionDataOption[] | undefined} options - Raw option data from the Discord interaction payload.
   * @param {APIInteractionDataResolved | undefined} resolved - Resolved entity maps (users, members, roles, channels, attachments).
   */
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
      Object.entries(resolved?.members ?? {}).map(
        ([id, member]) =>
          [
            id,
            {
              ...member,
              user: resolved?.users?.[id],
            },
          ] as [string, ResolvedSelectedGuildMember],
      ),
    );

    // Unwrap subcommand group, then subcommand, to reach the leaf options.
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

    // Single pass: index options by name and capture the focused option.
    for (const option of this.hoistedOptions) {
      this.hoistedOptionsMap.set(option.name, option);
      if (!this.focusedOption && "focused" in option && option.focused && "value" in option) {
        this.focusedOption = {
          name: option.name,
          type: option.type,
          value: option.value,
          focused: true,
        };
      }
    }
  }

  /**
   * The raw hoisted (leaf-level) options after subcommand unwrapping.
   * Prefer the typed `get*()` accessors over reading this directly.
   * @returns {APIApplicationCommandInteractionDataOption[]} The raw hoisted option data.
   */
  get data(): APIApplicationCommandInteractionDataOption[] {
    return this.hoistedOptions;
  }

  /**
   * Retrieves a raw option by name and asserts its type, using an O(1) map
   * lookup instead of a linear scan.
   *
   * @param {string} name - The option name to look up.
   * @param {ApplicationCommandOptionType} type - The expected `ApplicationCommandOptionType`.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {(APIApplicationCommandInteractionDataOption & { type: T }) | null} The matching option narrowed to `{ type: T }`, or `null`.
   * @throws {TypeError} When the option is required and absent.
   * @throws {TypeError} When the option exists but its type does not match `type`.
   */
  get<T extends ApplicationCommandOptionType>(
    name: string,
    type: T,
    required = false,
  ): (APIApplicationCommandInteractionDataOption & { type: T }) | null {
    const option = requireOption(this.hoistedOptionsMap.get(name), name, required);
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

  /**
   * Returns the name of the invoked subcommand.
   *
   * @param {boolean} required - When `true` (default), throws if no subcommand was selected.
   * @returns {string | null} The subcommand name, or `null` if none was selected and `required` is `false`.
   * @throws {TypeError} When `required` is `true` and no subcommand is present.
   */
  getSubcommand(required = true): string | null {
    if (required && !this.subcommand) {
      throw new TypeError("No subcommand selected");
    }
    return this.subcommand;
  }

  /**
   * Returns the name of the invoked subcommand group.
   *
   * @param {boolean} required - When `true`, throws if no subcommand group was selected.
   * @returns {string | null} The subcommand group name, or `null`.
   * @throws {TypeError} When `required` is `true` and no subcommand group is present.
   */
  getSubcommandGroup(required = false): string | null {
    if (required && !this.group) {
      throw new TypeError("No subcommand group selected");
    }
    return this.group;
  }

  /**
   * Returns the currently focused autocomplete option.
   * The value is captured once during construction, so this call is O(1).
   *
   * @returns {AutocompleteFocusedOption | null} The focused option descriptor, or `null` if none is focused.
   */
  getFocused(): AutocompleteFocusedOption | null {
    return this.focusedOption;
  }

  /**
   * Retrieves a boolean option value.
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {boolean | null} The boolean value, or `null` if the option is absent and optional.
   */
  getBoolean(name: string, required = false): boolean | null {
    return this.get(name, ApplicationCommandOptionType.Boolean, required)?.value ?? null;
  }

  /**
   * Retrieves a string option value.
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {T | null} The string value (narrowed to `T` if provided), or `null`.
   */
  getString<T extends string = string>(name: string, required = false): T | null {
    return (this.get(name, ApplicationCommandOptionType.String, required)?.value as T) ?? null;
  }

  /**
   * Retrieves an integer option value.
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {number | null} The integer value, or `null`.
   */
  getInteger(name: string, required = false): number | null {
    const value = this.get(name, ApplicationCommandOptionType.Integer, required)?.value;
    return typeof value === "number" ? value : null;
  }

  /**
   * Retrieves a number (float) option value.
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {number | null} The numeric value, or `null`.
   */
  getNumber(name: string, required = false): number | null {
    const value = this.get(name, ApplicationCommandOptionType.Number, required)?.value;
    return typeof value === "number" ? value : null;
  }

  /**
   * Retrieves a channel option value from the resolved channel map.
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @param {ChannelType[]} channelTypes - An optional allowlist of `ChannelType` values. When
   *   non-empty, throws if the resolved channel's type is not in the list.
   * @returns {APIInteractionDataResolvedChannel | null} The resolved channel, or `null`.
   * @throws {TypeError} When the resolved channel's type is not in `channelTypes`.
   */
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

  /**
   * Retrieves a user option value from the resolved user map.
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {APIUser | null} The resolved `APIUser`, or `null`.
   */
  getUser(name: string, required = false): APIUser | null {
    const option = this.get(name, ApplicationCommandOptionType.User, required);
    return option ? (this.users.get(option.value as Snowflake) ?? null) : null;
  }

  /**
   * Retrieves the guild member associated with a user option.
   * Falls back to `null` if the user is not a member of the guild (e.g. DM context).
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {ResolvedSelectedGuildMember | null} The resolved guild member (with embedded user), or `null`.
   */
  getMember(name: string, required = false): ResolvedSelectedGuildMember | null {
    const option = this.get(name, ApplicationCommandOptionType.User, required);
    return option ? (this.members.get(option.value as Snowflake) ?? null) : null;
  }

  /**
   * Retrieves a role option value from the resolved role map.
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {APIRole | null} The resolved `APIRole`, or `null`.
   */
  getRole(name: string, required = false): APIRole | null {
    const option = this.get(name, ApplicationCommandOptionType.Role, required);
    return option ? (this.roles.get(option.value as Snowflake) ?? null) : null;
  }

  /**
   * Retrieves an attachment option value from the resolved attachment map.
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {T | null} The resolved attachment cast to `T`, or `null`.
   */
  getAttachment<T = unknown>(name: string, required = false): T | null {
    const option = this.get(name, ApplicationCommandOptionType.Attachment, required);
    return option
      ? ((this.attachments.get(option.value as Snowflake) as T | undefined) ?? null)
      : null;
  }

  /**
   * Retrieves a mentionable option value, which may resolve to a guild member,
   * user, or role depending on what was selected.
   *
   * Resolution order: member → user → role.
   *
   * @param {string} name - The option name.
   * @param {boolean} required - When `true`, throws if the option is absent.
   * @returns {ResolvedSelectedGuildMember | APIUser | APIRole | null} The resolved member, user, or role, or `null`.
   */
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
