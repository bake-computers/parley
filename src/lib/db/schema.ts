import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const players = sqliteTable(
  "players",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: text("profile_id"),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull(),
    platform: text("platform").notNull(),
    profileUrl: text("profile_url"),
    level: integer("level").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    profileIdUnique: uniqueIndex("players_profile_id_unique").on(table.profileId),
    usernamePlatformUnique: uniqueIndex("players_username_platform_unique").on(
      table.usernameNormalized,
      table.platform,
    ),
    usernameLookupIdx: index("players_username_lookup_idx").on(table.usernameNormalized),
  }),
);

export const statSnapshots = sqliteTable(
  "stat_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    fetchedAt: integer("fetched_at").notNull(),
    source: text("source").notNull(),
    cacheVersion: integer("cache_version").notNull(),
    currentRank: text("current_rank"),
    rankPoints: integer("rank_points").notNull().default(0),
    matches: integer("matches").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    kills: integer("kills").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    headshots: integer("headshots").notNull().default(0),
    kdRatio: real("kd_ratio").notNull().default(0),
    headshotPercentage: real("headshot_percentage").notNull().default(0),
    winRate: real("win_rate").notNull().default(0),
    kost: real("kost").notNull().default(0),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    playerLookupIdx: index("stat_snapshots_player_idx").on(table.playerId),
    recencyIdx: index("stat_snapshots_player_fetched_idx").on(table.playerId, table.fetchedAt),
  }),
);
