import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

function timestampMs(name: string) {
  return bigint(name, { mode: "number" });
}

const Languages = pgEnum("languages", ["en", "de"]);
const Games = pgEnum("games", ["r6"]);

export const GuildSettings = pgTable(
  "guild_settings",
  {
    guildId: text("guild_id").notNull().primaryKey().unique(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
    language: Languages("language").notNull().default("en"),
  },
  (table) => [index("guild_settings_language_idx").on(table.language)],
);

/**
 * Discord user identity. One row per Discord user.
 * Game accounts link through `linkedGameAccounts`.
 */
export const Users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    discordUserId: text("discord_user_id").notNull().unique(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [index("users_discord_id_idx").on(table.discordUserId)],
);

/**
 * User settings. Per-user preferences that override guild defaults.
 */
export const UserSettings = pgTable(
  "user_settings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => Users.id, { onDelete: "cascade" }),
    language: Languages("language").notNull().default("en"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [uniqueIndex("user_settings_user_unique_idx").on(table.userId)],
);

/**
 * Linked game accounts. Supports any game plugin.
 * One account per user per game (enforced by unique constraint).
 * Stores universal game account fields: platform, profile ID, username.
 */
export const LinkedGameAccounts = pgTable(
  "linked_game_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => Users.id, { onDelete: "cascade" }),
    game: Games("game").notNull(),
    profileId: text("profile_id").notNull(),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull(),
    platform: text("platform").notNull(),
    profileUrl: text("profile_url"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("linked_game_accounts_user_game_unique_idx").on(table.userId, table.game),
    uniqueIndex("linked_game_accounts_profile_id_unique_idx").on(table.profileId),
    index("linked_game_accounts_game_idx").on(table.game),
    index("linked_game_accounts_username_platform_idx").on(
      table.usernameNormalized,
      table.platform,
    ),
  ],
);

/**
 * Polymorphic game profiles. One row per user per game.
 * Core stats (ELO, matches) are columns for efficient querying.
 * Game-specific data stored in `metadata` JSONB for extensibility.
 *
 * Plugin architecture: new games simply insert new linkedGameAccounts + gameProfiles.
 */
export const GameProfiles = pgTable(
  "game_profiles",
  {
    id: serial("id").primaryKey(),
    linkedGameAccountId: integer("linked_game_account_id")
      .notNull()
      .references(() => LinkedGameAccounts.id, { onDelete: "cascade" }),
    game: Games("game").notNull(),
    // Core queryable fields
    internalElo: doublePrecision("internal_elo").notNull().default(1000),
    internalMatches: integer("internal_matches").notNull().default(0),
    internalWins: integer("internal_wins").notNull().default(0),
    internalLosses: integer("internal_losses").notNull().default(0),
    internalUpdatedAt: timestampMs("internal_updated_at"),
    // Game-specific extensible data (rank, level, game-specific stats, etc.)
    metadata: jsonb("metadata").$type<{
      level?: number;
      currentRank?: string;
      rankPoints?: number;
      [key: string]: unknown;
    }>(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("game_profiles_linked_account_game_unique_idx").on(
      table.linkedGameAccountId,
      table.game,
    ),
    index("game_profiles_elo_idx").on(table.internalElo),
    index("game_profiles_game_idx").on(table.game),
  ],
);

/**
 * Time-series snapshots of game profile stats.
 * Used for analytics, leaderboards, and historical tracking.
 */
export const GameProfileSnapshots = pgTable(
  "game_profile_snapshots",
  {
    id: serial("id").primaryKey(),
    gameProfileId: integer("game_profile_id")
      .notNull()
      .references(() => GameProfiles.id, { onDelete: "cascade" }),
    fetchedAt: timestampMs("fetched_at").notNull(),
    source: text("source").notNull(),
    cacheVersion: integer("cache_version").notNull(),
    internalElo: doublePrecision("internal_elo").notNull(),
    internalMatches: integer("internal_matches").notNull(),
    internalWins: integer("internal_wins").notNull(),
    internalLosses: integer("internal_losses").notNull(),
    metadata: jsonb("metadata").$type<{ [key: string]: unknown }>(),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => [
    index("game_profile_snapshots_profile_fetched_idx").on(table.gameProfileId, table.fetchedAt),
  ],
);
