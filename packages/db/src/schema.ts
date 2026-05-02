import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

function timestampMs(name: string) {
  return bigint(name, { mode: "number" });
}

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id"),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull(),
    platform: text("platform").notNull(),
    profileUrl: text("profile_url"),
    level: integer("level").notNull().default(0),
    internalElo: doublePrecision("internal_elo").notNull().default(1000),
    internalMatches: integer("internal_matches").notNull().default(0),
    internalWins: integer("internal_wins").notNull().default(0),
    internalLosses: integer("internal_losses").notNull().default(0),
    internalUpdatedAt: timestampMs("internal_updated_at"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    profileIdUnique: uniqueIndex("players_profile_id_unique").on(table.profileId),
    usernamePlatformUnique: uniqueIndex("players_username_platform_unique").on(
      table.usernameNormalized,
      table.platform,
    ),
  }),
);

export const statSnapshots = pgTable(
  "stat_snapshots",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    fetchedAt: timestampMs("fetched_at").notNull(),
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
    kdRatio: doublePrecision("kd_ratio").notNull().default(0),
    headshotPercentage: doublePrecision("headshot_percentage").notNull().default(0),
    winRate: doublePrecision("win_rate").notNull().default(0),
    kost: doublePrecision("kost").notNull().default(0),
    payloadJson: text("payload_json").notNull(),
    createdAt: timestampMs("created_at").notNull(),
  },
  (table) => ({
    recencyIdx: index("stat_snapshots_player_fetched_idx").on(table.playerId, table.fetchedAt),
  }),
);

export const discordAccounts = pgTable(
  "discord_accounts",
  {
    id: serial("id").primaryKey(),
    discordUserId: text("discord_user_id").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    discordUserIdUnique: uniqueIndex("discord_accounts_discord_user_id_unique").on(
      table.discordUserId,
    ),
    playerIdUnique: uniqueIndex("discord_accounts_player_id_unique").on(table.playerId),
  }),
);

export const guildPlayers = pgTable(
  "guild_players",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    discordUserId: text("discord_user_id").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
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
    playerLookupIdx: index("guild_players_player_idx").on(table.playerId),
    discordUserLookupIdx: index("guild_players_discord_user_idx").on(table.discordUserId),
  }),
);

export const guildLimits = pgTable(
  "guild_limits",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    dailyMatchLimit: integer("daily_match_limit").notNull(),
    updatedByDiscordUserId: text("updated_by_discord_user_id").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    guildIdUnique: uniqueIndex("guild_limits_guild_id_unique").on(table.guildId),
  }),
);

export const customMatches = pgTable(
  "custom_matches",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    createdByDiscordUserId: text("created_by_discord_user_id").notNull(),
    status: text("status").notNull(),
    matchType: text("match_type").notNull().default("internal"),
    opponentGuildId: text("opponent_guild_id"),
    opponentChannelId: text("opponent_channel_id"),
    opponentMessageId: text("opponent_message_id"),
    opponentCaptainDiscordUserId: text("opponent_captain_discord_user_id"),
    teamASeedTotal: doublePrecision("team_a_seed_total").notNull(),
    teamBSeedTotal: doublePrecision("team_b_seed_total").notNull(),
    seedGap: doublePrecision("seed_gap").notNull(),
    winningTeam: text("winning_team"),
    resolutionType: text("resolution_type").notNull().default("played"),
    teamABalanceTotal: doublePrecision("team_a_balance_total").notNull().default(0),
    teamBBalanceTotal: doublePrecision("team_b_balance_total").notNull().default(0),
    balanceGap: doublePrecision("balance_gap").notNull().default(0),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    guildCreatedIdx: index("custom_matches_guild_created_idx").on(table.guildId, table.createdAt),
    opponentGuildCreatedIdx: index("custom_matches_opponent_guild_created_idx").on(
      table.opponentGuildId,
      table.createdAt,
    ),
    statusIdx: index("custom_matches_status_idx").on(table.status),
    matchTypeStatusIdx: index("custom_matches_match_type_status_idx").on(
      table.matchType,
      table.status,
    ),
  }),
);

export const customMatchPlayers = pgTable(
  "custom_match_players",
  {
    id: serial("id").primaryKey(),
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
    seedKdRatio: doublePrecision("seed_kd_ratio").notNull(),
    seedKost: doublePrecision("seed_kost").notNull(),
    seedKpr: doublePrecision("seed_kpr").notNull(),
    seedHeadshotPercentage: doublePrecision("seed_headshot_percentage").notNull(),
    seedScore: doublePrecision("seed_score").notNull(),
    balanceRating: doublePrecision("balance_rating").notNull().default(0),
    kills: integer("kills"),
    deaths: integer("deaths"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
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
  }),
);

export const matchmakingQueues = pgTable(
  "matchmaking_queues",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    captainDiscordUserId: text("captain_discord_user_id").notNull(),
    status: text("status").notNull(),
    playerCount: integer("player_count").notNull(),
    stackBalanceTotal: doublePrecision("stack_balance_total").notNull(),
    stackBalanceAverage: doublePrecision("stack_balance_average").notNull(),
    matchedMatchId: integer("matched_match_id").references(() => customMatches.id, {
      onDelete: "set null",
    }),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    guildStatusIdx: index("matchmaking_queues_guild_status_idx").on(table.guildId, table.status),
    captainStatusIdx: index("matchmaking_queues_captain_status_idx").on(
      table.captainDiscordUserId,
      table.status,
    ),
    statusCreatedIdx: index("matchmaking_queues_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    expiresAtIdx: index("matchmaking_queues_expires_at_idx").on(table.expiresAt),
  }),
);

export const matchmakingQueuePlayers = pgTable(
  "matchmaking_queue_players",
  {
    id: serial("id").primaryKey(),
    queueId: integer("queue_id")
      .notNull()
      .references(() => matchmakingQueues.id, { onDelete: "cascade" }),
    discordUserId: text("discord_user_id").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    username: text("username").notNull(),
    platform: text("platform").notNull(),
    balanceRating: doublePrecision("balance_rating").notNull(),
    seedRankPoints: integer("seed_rank_points").notNull(),
    seedKdRatio: doublePrecision("seed_kd_ratio").notNull(),
    seedKost: doublePrecision("seed_kost").notNull(),
    seedKpr: doublePrecision("seed_kpr").notNull(),
    seedHeadshotPercentage: doublePrecision("seed_headshot_percentage").notNull(),
    seedScore: doublePrecision("seed_score").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    queueUserUnique: uniqueIndex("matchmaking_queue_players_queue_user_unique").on(
      table.queueId,
      table.discordUserId,
    ),
    queueSlotUnique: uniqueIndex("matchmaking_queue_players_queue_slot_unique").on(
      table.queueId,
      table.slot,
    ),
    playerLookupIdx: index("matchmaking_queue_players_player_idx").on(table.playerId),
  }),
);

export const tournaments = pgTable(
  "tournaments",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    format: text("format").notNull(),
    teamCap: integer("team_cap").notNull(),
    visibility: text("visibility").notNull().default("public"),
    status: text("status").notNull(),
    createdByGuildId: text("created_by_guild_id").notNull(),
    createdByChannelId: text("created_by_channel_id").notNull(),
    createdByDiscordUserId: text("created_by_discord_user_id").notNull(),
    hubMessageId: text("hub_message_id"),
    filledAt: timestampMs("filled_at"),
    autoStartAt: timestampMs("auto_start_at"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    winnerEntryId: integer("winner_entry_id"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    nameLookupIdx: index("tournaments_name_lookup_idx").on(table.nameNormalized),
    visibilityStatusIdx: index("tournaments_visibility_status_idx").on(
      table.visibility,
      table.status,
    ),
    autoStartIdx: index("tournaments_auto_start_idx").on(table.status, table.autoStartAt),
  }),
);

export const tournamentEntries = pgTable(
  "tournament_entries",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    captainDiscordUserId: text("captain_discord_user_id").notNull(),
    teamName: text("team_name").notNull(),
    teamNameNormalized: text("team_name_normalized").notNull(),
    status: text("status").notNull(),
    seedNumber: integer("seed_number"),
    stackBalanceTotal: doublePrecision("stack_balance_total").notNull(),
    stackBalanceAverage: doublePrecision("stack_balance_average").notNull(),
    joinedAt: timestampMs("joined_at").notNull(),
    eliminatedAt: timestampMs("eliminated_at"),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    tournamentCaptainUnique: uniqueIndex("tournament_entries_tournament_captain_unique").on(
      table.tournamentId,
      table.captainDiscordUserId,
    ),
    tournamentTeamNameUnique: uniqueIndex("tournament_entries_tournament_team_name_unique").on(
      table.tournamentId,
      table.teamNameNormalized,
    ),
    tournamentStatusIdx: index("tournament_entries_tournament_status_idx").on(
      table.tournamentId,
      table.status,
    ),
    guildLookupIdx: index("tournament_entries_guild_idx").on(table.guildId),
  }),
);

export const tournamentEntryPlayers = pgTable(
  "tournament_entry_players",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => tournamentEntries.id, { onDelete: "cascade" }),
    discordUserId: text("discord_user_id").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    username: text("username").notNull(),
    platform: text("platform").notNull(),
    balanceRating: doublePrecision("balance_rating").notNull(),
    seedRankPoints: integer("seed_rank_points").notNull(),
    seedKdRatio: doublePrecision("seed_kd_ratio").notNull(),
    seedKost: doublePrecision("seed_kost").notNull(),
    seedKpr: doublePrecision("seed_kpr").notNull(),
    seedHeadshotPercentage: doublePrecision("seed_headshot_percentage").notNull(),
    seedScore: doublePrecision("seed_score").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    entrySlotUnique: uniqueIndex("tournament_entry_players_entry_slot_unique").on(
      table.entryId,
      table.slot,
    ),
    entryUserUnique: uniqueIndex("tournament_entry_players_entry_user_unique").on(
      table.entryId,
      table.discordUserId,
    ),
    tournamentUserUnique: uniqueIndex("tournament_entry_players_tournament_user_unique").on(
      table.tournamentId,
      table.discordUserId,
    ),
    tournamentPlayerUnique: uniqueIndex("tournament_entry_players_tournament_player_unique").on(
      table.tournamentId,
      table.playerId,
    ),
    playerLookupIdx: index("tournament_entry_players_player_idx").on(table.playerId),
  }),
);

export const tournamentBracketMatches = pgTable(
  "tournament_bracket_matches",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    bracket: text("bracket").notNull(),
    roundNumber: integer("round_number").notNull(),
    matchNumber: integer("match_number").notNull(),
    status: text("status").notNull(),
    entryAId: integer("entry_a_id").references(() => tournamentEntries.id, {
      onDelete: "set null",
    }),
    entryBId: integer("entry_b_id").references(() => tournamentEntries.id, {
      onDelete: "set null",
    }),
    winnerEntryId: integer("winner_entry_id").references(() => tournamentEntries.id, {
      onDelete: "set null",
    }),
    loserEntryId: integer("loser_entry_id").references(() => tournamentEntries.id, {
      onDelete: "set null",
    }),
    winnerToMatchId: integer("winner_to_match_id"),
    winnerToSlot: text("winner_to_slot"),
    loserToMatchId: integer("loser_to_match_id"),
    loserToSlot: text("loser_to_slot"),
    customMatchId: integer("custom_match_id").references(() => customMatches.id, {
      onDelete: "set null",
    }),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => ({
    tournamentRoundMatchUnique: uniqueIndex("tournament_bracket_matches_round_match_unique").on(
      table.tournamentId,
      table.bracket,
      table.roundNumber,
      table.matchNumber,
    ),
    tournamentStatusIdx: index("tournament_bracket_matches_tournament_status_idx").on(
      table.tournamentId,
      table.status,
    ),
    customMatchIdx: index("tournament_bracket_matches_custom_match_idx").on(table.customMatchId),
  }),
);

export const authUsers = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull(),
    image: text("image"),
    username: text("username"),
    displayUsername: text("display_username"),
    role: text("role"),
    banned: boolean("banned"),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    emailUnique: uniqueIndex("user_email_unique").on(table.email),
    usernameUnique: uniqueIndex("user_username_unique").on(table.username),
  }),
);

export const authSessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("session_token_unique").on(table.token),
    userLookupIdx: index("session_user_id_idx").on(table.userId),
  }),
);

export const authAccounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: "date" }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: "date" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    userLookupIdx: index("account_user_id_idx").on(table.userId),
  }),
);

export const authVerifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }),
  },
  (table) => ({
    identifierValueUnique: uniqueIndex("verification_identifier_value_unique").on(
      table.identifier,
      table.value,
    ),
  }),
);

export const playersRelations = relations(players, ({ many, one }) => ({
  statSnapshots: many(statSnapshots),
  discordAccounts: many(discordAccounts),
  guildPlayers: many(guildPlayers),
  customMatchPlayers: many(customMatchPlayers),
  matchmakingQueuePlayers: many(matchmakingQueuePlayers),
  tournamentEntryPlayers: many(tournamentEntryPlayers),
  tournamentChampionEntries: many(tournamentEntries, {
    relationName: "tournamentChampionPlayer",
  }),
  account: one(discordAccounts, {
    fields: [players.id],
    references: [discordAccounts.playerId],
  }),
}));

export const statSnapshotsRelations = relations(statSnapshots, ({ one }) => ({
  player: one(players, {
    fields: [statSnapshots.playerId],
    references: [players.id],
  }),
}));

export const discordAccountsRelations = relations(discordAccounts, ({ one }) => ({
  player: one(players, {
    fields: [discordAccounts.playerId],
    references: [players.id],
  }),
}));

export const guildPlayersRelations = relations(guildPlayers, ({ one }) => ({
  player: one(players, {
    fields: [guildPlayers.playerId],
    references: [players.id],
  }),
}));

export const customMatchesRelations = relations(customMatches, ({ many }) => ({
  players: many(customMatchPlayers),
  matchmakingQueues: many(matchmakingQueues),
  tournamentBracketMatches: many(tournamentBracketMatches),
}));

export const customMatchPlayersRelations = relations(customMatchPlayers, ({ one }) => ({
  match: one(customMatches, {
    fields: [customMatchPlayers.matchId],
    references: [customMatches.id],
  }),
  player: one(players, {
    fields: [customMatchPlayers.playerId],
    references: [players.id],
  }),
}));

export const matchmakingQueuesRelations = relations(matchmakingQueues, ({ many, one }) => ({
  players: many(matchmakingQueuePlayers),
  matchedMatch: one(customMatches, {
    fields: [matchmakingQueues.matchedMatchId],
    references: [customMatches.id],
  }),
}));

export const matchmakingQueuePlayersRelations = relations(matchmakingQueuePlayers, ({ one }) => ({
  queue: one(matchmakingQueues, {
    fields: [matchmakingQueuePlayers.queueId],
    references: [matchmakingQueues.id],
  }),
  player: one(players, {
    fields: [matchmakingQueuePlayers.playerId],
    references: [players.id],
  }),
}));

export const tournamentsRelations = relations(tournaments, ({ many }) => ({
  entries: many(tournamentEntries),
  bracketMatches: many(tournamentBracketMatches),
  entryPlayers: many(tournamentEntryPlayers),
}));

export const tournamentEntriesRelations = relations(tournamentEntries, ({ many, one }) => ({
  tournament: one(tournaments, {
    fields: [tournamentEntries.tournamentId],
    references: [tournaments.id],
  }),
  players: many(tournamentEntryPlayers),
  bracketMatchesAsEntryA: many(tournamentBracketMatches, {
    relationName: "tournamentBracketEntryA",
  }),
  bracketMatchesAsEntryB: many(tournamentBracketMatches, {
    relationName: "tournamentBracketEntryB",
  }),
  bracketMatchesAsWinner: many(tournamentBracketMatches, {
    relationName: "tournamentBracketWinner",
  }),
  bracketMatchesAsLoser: many(tournamentBracketMatches, {
    relationName: "tournamentBracketLoser",
  }),
}));

export const tournamentEntryPlayersRelations = relations(tournamentEntryPlayers, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [tournamentEntryPlayers.tournamentId],
    references: [tournaments.id],
  }),
  entry: one(tournamentEntries, {
    fields: [tournamentEntryPlayers.entryId],
    references: [tournamentEntries.id],
  }),
  player: one(players, {
    fields: [tournamentEntryPlayers.playerId],
    references: [players.id],
  }),
}));

export const tournamentBracketMatchesRelations = relations(tournamentBracketMatches, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [tournamentBracketMatches.tournamentId],
    references: [tournaments.id],
  }),
  entryA: one(tournamentEntries, {
    fields: [tournamentBracketMatches.entryAId],
    references: [tournamentEntries.id],
    relationName: "tournamentBracketEntryA",
  }),
  entryB: one(tournamentEntries, {
    fields: [tournamentBracketMatches.entryBId],
    references: [tournamentEntries.id],
    relationName: "tournamentBracketEntryB",
  }),
  winnerEntry: one(tournamentEntries, {
    fields: [tournamentBracketMatches.winnerEntryId],
    references: [tournamentEntries.id],
    relationName: "tournamentBracketWinner",
  }),
  loserEntry: one(tournamentEntries, {
    fields: [tournamentBracketMatches.loserEntryId],
    references: [tournamentEntries.id],
    relationName: "tournamentBracketLoser",
  }),
  customMatch: one(customMatches, {
    fields: [tournamentBracketMatches.customMatchId],
    references: [customMatches.id],
  }),
}));

export const authUsersRelations = relations(authUsers, ({ many }) => ({
  accounts: many(authAccounts),
  sessions: many(authSessions),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(authUsers, {
    fields: [authSessions.userId],
    references: [authUsers.id],
  }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(authUsers, {
    fields: [authAccounts.userId],
    references: [authUsers.id],
  }),
}));
