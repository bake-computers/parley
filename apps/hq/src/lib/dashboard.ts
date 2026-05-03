export const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
] as const;

export const GAME_OPTIONS = [
  { value: "all", label: "All games" },
  { value: "r6", label: "Rainbow Six Siege" },
] as const;

export type DashboardPeriod = (typeof PERIOD_OPTIONS)[number]["value"];
export type DashboardGame = (typeof GAME_OPTIONS)[number]["value"];

export interface DashboardFilters {
  period: DashboardPeriod;
  server: string;
  game: DashboardGame;
  feature: string;
}

export interface DashboardMetricCard {
  label: string;
  value: string;
  detail: string;
}

export interface DashboardTimeseriesPoint {
  bucket: string;
  commands: number;
  avgLatencyMs: number;
}

export interface DashboardGrowthPoint {
  bucket: string;
  players: number;
  servers: number;
}

export interface DashboardBarPoint {
  label: string;
  value: number;
}

export interface DashboardFeatureRow {
  feature: string;
  commands: number;
  avgLatencyMs: number;
  errorRatePct: number;
}

export interface DashboardServerRow {
  guildId: string;
  commands: number;
  avgLatencyMs: number;
}

export interface DashboardFilterOption {
  value: string;
  label: string;
}

export interface DashboardData {
  analyticsConfigured: boolean;
  analyticsHasData: boolean;
  metrics: DashboardMetricCard[];
  usageSeries: DashboardTimeseriesPoint[];
  growthSeries: DashboardGrowthPoint[];
  featureBars: DashboardBarPoint[];
  topFeatures: DashboardFeatureRow[];
  topServers: DashboardServerRow[];
  serverOptions: DashboardFilterOption[];
  featureOptions: DashboardFilterOption[];
}

export interface DashboardPageData {
  auth:
    | {
        status: "signed_out";
      }
    | {
        status: "forbidden";
        discordUserId: string | null;
        userName: string;
      }
    | {
        status: "authorized";
        discordUserId: string;
        userName: string;
        isGlobalAdmin: boolean;
      };
  filters: DashboardFilters;
  generatedAt: string;
  dashboard: DashboardData | null;
}

export function normalizeDashboardFilters(input: Record<string, unknown>): DashboardFilters {
  const period = PERIOD_OPTIONS.find((option) => option.value === input.period)?.value ?? "30d";
  const game = GAME_OPTIONS.find((option) => option.value === input.game)?.value ?? "all";
  const server = typeof input.server === "string" && input.server.length > 0 ? input.server : "all";
  const feature =
    typeof input.feature === "string" && input.feature.length > 0 ? input.feature : "all";

  return {
    period,
    server,
    game,
    feature,
  };
}

export function readPeriodDays(period: DashboardPeriod): number {
  return PERIOD_OPTIONS.find((option) => option.value === period)?.days ?? 30;
}
