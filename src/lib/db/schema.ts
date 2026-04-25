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

export const discordAccounts = sqliteTable(
  "discord_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    discordUserId: text("discord_user_id").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    discordUserIdUnique: uniqueIndex("discord_accounts_discord_user_id_unique").on(
      table.discordUserId,
    ),
    playerIdUnique: uniqueIndex("discord_accounts_player_id_unique").on(table.playerId),
  }),
);

export const guildPlayers = sqliteTable(
  "guild_players",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    discordUserId: text("discord_user_id").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    guildUserUnique: uniqueIndex("guild_players_guild_user_unique").on(
      table.guildId,
      table.discordUserId,
    ),
    guildPlayerUnique: uniqueIndex("guild_players_guild_player_unique").on(
      table.guildId,
      table.playerId,
    ),
    guildLookupIdx: index("guild_players_guild_idx").on(table.guildId),
    playerLookupIdx: index("guild_players_player_idx").on(table.playerId),
  }),
);

export const guildLimits = sqliteTable(
  "guild_limits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    dailyMatchLimit: integer("daily_match_limit").notNull(),
    updatedByDiscordUserId: text("updated_by_discord_user_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    guildIdUnique: uniqueIndex("guild_limits_guild_id_unique").on(table.guildId),
  }),
);

export const customMatches = sqliteTable(
  "custom_matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    createdByDiscordUserId: text("created_by_discord_user_id").notNull(),
    status: text("status").notNull(),
    teamASeedTotal: real("team_a_seed_total").notNull(),
    teamBSeedTotal: real("team_b_seed_total").notNull(),
    seedGap: real("seed_gap").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    guildCreatedIdx: index("custom_matches_guild_created_idx").on(table.guildId, table.createdAt),
    statusIdx: index("custom_matches_status_idx").on(table.status),
  }),
);

export const customMatchPlayers = sqliteTable(
  "custom_match_players",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matchId: integer("match_id")
      .notNull()
      .references(() => customMatches.id, { onDelete: "cascade" }),
    discordUserId: text("discord_user_id").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    team: text("team").notNull(),
    slot: integer("slot").notNull(),
    seedRankPoints: integer("seed_rank_points").notNull(),
    seedKdRatio: real("seed_kd_ratio").notNull(),
    seedKost: real("seed_kost").notNull(),
    seedKpr: real("seed_kpr").notNull(),
    seedHeadshotPercentage: real("seed_headshot_percentage").notNull(),
    seedScore: real("seed_score").notNull(),
    kills: integer("kills"),
    deaths: integer("deaths"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    matchUserUnique: uniqueIndex("custom_match_players_match_user_unique").on(
      table.matchId,
      table.discordUserId,
    ),
    matchTeamSlotUnique: uniqueIndex("custom_match_players_match_team_slot_unique").on(
      table.matchId,
      table.team,
      table.slot,
    ),
    matchLookupIdx: index("custom_match_players_match_idx").on(table.matchId),
  }),
);
