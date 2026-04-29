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
    internalElo: real("internal_elo").notNull().default(1000),
    internalMatches: integer("internal_matches").notNull().default(0),
    internalWins: integer("internal_wins").notNull().default(0),
    internalLosses: integer("internal_losses").notNull().default(0),
    internalUpdatedAt: integer("internal_updated_at"),
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
    matchType: text("match_type").notNull().default("internal"),
    opponentGuildId: text("opponent_guild_id"),
    opponentChannelId: text("opponent_channel_id"),
    opponentMessageId: text("opponent_message_id"),
    opponentCaptainDiscordUserId: text("opponent_captain_discord_user_id"),
    teamASeedTotal: real("team_a_seed_total").notNull(),
    teamBSeedTotal: real("team_b_seed_total").notNull(),
    seedGap: real("seed_gap").notNull(),
    winningTeam: text("winning_team"),
    resolutionType: text("resolution_type").notNull().default("played"),
    teamABalanceTotal: real("team_a_balance_total").notNull().default(0),
    teamBBalanceTotal: real("team_b_balance_total").notNull().default(0),
    balanceGap: real("balance_gap").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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
    balanceRating: real("balance_rating").notNull().default(0),
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

export const matchmakingQueues = sqliteTable(
  "matchmaking_queues",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    captainDiscordUserId: text("captain_discord_user_id").notNull(),
    status: text("status").notNull(),
    playerCount: integer("player_count").notNull(),
    stackBalanceTotal: real("stack_balance_total").notNull(),
    stackBalanceAverage: real("stack_balance_average").notNull(),
    matchedMatchId: integer("matched_match_id").references(() => customMatches.id, {
      onDelete: "set null",
    }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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

export const matchmakingQueuePlayers = sqliteTable(
  "matchmaking_queue_players",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    balanceRating: real("balance_rating").notNull(),
    seedRankPoints: integer("seed_rank_points").notNull(),
    seedKdRatio: real("seed_kd_ratio").notNull(),
    seedKost: real("seed_kost").notNull(),
    seedKpr: real("seed_kpr").notNull(),
    seedHeadshotPercentage: real("seed_headshot_percentage").notNull(),
    seedScore: real("seed_score").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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
    queueLookupIdx: index("matchmaking_queue_players_queue_idx").on(table.queueId),
    playerLookupIdx: index("matchmaking_queue_players_player_idx").on(table.playerId),
  }),
);

export const tournaments = sqliteTable(
  "tournaments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    filledAt: integer("filled_at"),
    autoStartAt: integer("auto_start_at"),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
    winnerEntryId: integer("winner_entry_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    nameLookupIdx: index("tournaments_name_lookup_idx").on(table.nameNormalized),
    statusIdx: index("tournaments_status_idx").on(table.status),
    visibilityStatusIdx: index("tournaments_visibility_status_idx").on(
      table.visibility,
      table.status,
    ),
    autoStartIdx: index("tournaments_auto_start_idx").on(table.status, table.autoStartAt),
  }),
);

export const tournamentEntries = sqliteTable(
  "tournament_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    stackBalanceTotal: real("stack_balance_total").notNull(),
    stackBalanceAverage: real("stack_balance_average").notNull(),
    joinedAt: integer("joined_at").notNull(),
    eliminatedAt: integer("eliminated_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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
    tournamentLookupIdx: index("tournament_entries_tournament_idx").on(table.tournamentId),
    tournamentStatusIdx: index("tournament_entries_tournament_status_idx").on(
      table.tournamentId,
      table.status,
    ),
    guildLookupIdx: index("tournament_entries_guild_idx").on(table.guildId),
  }),
);

export const tournamentEntryPlayers = sqliteTable(
  "tournament_entry_players",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    balanceRating: real("balance_rating").notNull(),
    seedRankPoints: integer("seed_rank_points").notNull(),
    seedKdRatio: real("seed_kd_ratio").notNull(),
    seedKost: real("seed_kost").notNull(),
    seedKpr: real("seed_kpr").notNull(),
    seedHeadshotPercentage: real("seed_headshot_percentage").notNull(),
    seedScore: real("seed_score").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
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
    tournamentLookupIdx: index("tournament_entry_players_tournament_idx").on(table.tournamentId),
    entryLookupIdx: index("tournament_entry_players_entry_idx").on(table.entryId),
    playerLookupIdx: index("tournament_entry_players_player_idx").on(table.playerId),
  }),
);

export const tournamentBracketMatches = sqliteTable(
  "tournament_bracket_matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    tournamentRoundMatchUnique: uniqueIndex("tournament_bracket_matches_round_match_unique").on(
      table.tournamentId,
      table.bracket,
      table.roundNumber,
      table.matchNumber,
    ),
    tournamentLookupIdx: index("tournament_bracket_matches_tournament_idx").on(table.tournamentId),
    tournamentStatusIdx: index("tournament_bracket_matches_tournament_status_idx").on(
      table.tournamentId,
      table.status,
    ),
    customMatchIdx: index("tournament_bracket_matches_custom_match_idx").on(table.customMatchId),
  }),
);
