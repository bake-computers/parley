export interface GuildSettings {
  guildId: string;
  dailyMatchLimit?: number;
  defaultTeamFormat?: string;
  autoBalance?: boolean;
  crossGuildMatchmaking?: boolean;
}

export interface GuildWithPermissions {
  id: string;
  name: string;
  icon?: string;
  permissions: string[];
}

export interface MatchHistoryEntry {
  matchId: number;
  date: number;
  teamA: string[];
  teamB: string[];
  scores: { teamA: number; teamB: number };
  eloDelta: number;
  status: string;
}

export interface TournamentSummary {
  id: number;
  name: string;
  format: string;
  teamCap: number;
  status: string;
}

export interface AutoTournamentSchedule {
  id: number;
  guildId: string;
  name: string;
  format: string;
  teamCap: number;
  cronExpression: string;
  channelId: string;
  roleId?: string;
  enabled: boolean;
}

export interface GuildMatchRules {
  guildId: string;
  minElo?: number;
  maxElo?: number;
  platforms?: string[];
  requireVerified?: boolean;
  maxEloGap?: number;
}

export interface GuildNotificationSettings {
  guildId: string;
  matchResultsChannel?: string;
  tournamentAnnouncementsChannel?: string;
  leaderboardUpdatesEnabled?: boolean;
}

export interface PlayerRosterEntry {
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  winRate: number;
}
