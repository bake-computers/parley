/** Rainbow Six Siege — matches parley.common.v1.Game GAME_R6 */
export const GAME_R6 = 1 as const;

export type GuildSettingsJson = {
  guildId: string;
  game: number;
  defaultTeamFormat: string;
  autoBalance: boolean;
  crossGuildMatchmaking: boolean;
  updatedAtMs: number;
  updatedByDiscordUserId: string;
  defaultLanguage: number;
  matchmakingEnabled: boolean;
};

export type GuildMatchmakingRulesJson = {
  guildId: string;
  game: number;
  minElo: number;
  maxElo: number;
  platforms: string[];
  requireVerified: boolean;
  maxEloGap: number;
  updatedAtMs: number;
};

export type GuildNotificationSettingsJson = {
  guildId: string;
  game: number;
  matchResultsChannel: string;
  tournamentAnnouncementsChannel: string;
  leaderboardUpdatesEnabled: boolean;
  updatedAtMs: number;
  crossGuildAnnouncementsEnabled: boolean;
  announceMatchReadyEnabled: boolean;
  announceMatchResultsEnabled: boolean;
};

export type GuildMatchQuotaJson = {
  guildId: string;
  game: number;
  dailyMatchLimit: number;
  updatedByDiscordUserId: string;
  updatedAtMs: number;
};

export type GuildSettingsBundleJson = {
  general: GuildSettingsJson;
  matchmakingRules: GuildMatchmakingRulesJson;
  notifications: GuildNotificationSettingsJson;
  matchQuota: GuildMatchQuotaJson;
};

export type SettingsSection = keyof GuildSettingsBundleJson;