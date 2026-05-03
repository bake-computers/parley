export interface LeaderboardEntry {
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  rank: number;
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  totalPlayers: number;
  page: number;
  pageSize: number;
}

export interface LeaderboardUpdate {
  type: "LEADERBOARD_UPDATE";
  data: LeaderboardEntry[];
  timestamp: number;
}

export interface LeaderboardConnected {
  type: "LEADERBOARD_SNAPSHOT";
  data: LeaderboardEntry[];
}

export interface LeaderboardSubscribe {
  type: "SUBSCRIBE";
  range: [number, number];
}
