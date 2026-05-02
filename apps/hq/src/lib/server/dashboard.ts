import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { players, guildPlayers } from "@parley/db/schema";
import type { DbClient } from "@parley/db/client";
import type { SessionAccess } from "@parley/auth";
import {
  normalizeDashboardFilters,
  readPeriodDays,
  type DashboardBarPoint,
  type DashboardData,
  type DashboardFeatureRow,
  type DashboardFilterOption,
  type DashboardFilters,
  type DashboardGrowthPoint,
  type DashboardPageData,
  type DashboardServerRow,
  type DashboardTimeseriesPoint,
} from "../dashboard";
import { readDashboardSession } from "./auth";
import { withDb } from "./db";

interface AnalyticsQueryResult<Row> {
  data?: Row[];
}

interface TotalsRow {
  total_commands: number | string;
  avg_latency_ms: number | string;
  error_count: number | string;
  active_servers: number | string;
}

interface UsageSeriesRow {
  bucket: string;
  commands: number | string;
  avg_latency_ms: number | string;
}

interface FeatureBarRow {
  label: string;
  value: number | string;
}

interface FeatureTableRow {
  feature: string;
  commands: number | string;
  avg_latency_ms: number | string;
  error_count: number | string;
}

interface ServerRow {
  guild_id: string;
  commands: number | string;
  avg_latency_ms: number | string;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatLatency(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value)} ms`;
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
}

function parseNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function toSqlDateTime(value: Date): string {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  const hours = `${value.getUTCHours()}`.padStart(2, "0");
  const minutes = `${value.getUTCMinutes()}`.padStart(2, "0");
  const seconds = `${value.getUTCSeconds()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function buildAnalyticsWhere(
  filters: DashboardFilters,
  input: { forOptions?: boolean } = {},
): string {
  const days = readPeriodDays(filters.period);
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const conditions = [
    "blob1 = 'discord'",
    `timestamp >= toDateTime('${toSqlDateTime(start)}')`,
    `timestamp < toDateTime('${toSqlDateTime(end)}')`,
  ];

  if (!input.forOptions && filters.server !== "all") {
    conditions.push(`blob6 = '${escapeSqlLiteral(filters.server)}'`);
  }
  if (!input.forOptions && filters.feature !== "all") {
    conditions.push(`blob3 = '${escapeSqlLiteral(filters.feature)}'`);
  }
  if (filters.game !== "all" && filters.game !== "r6") {
    conditions.push("1 = 0");
  }

  return conditions.join(" AND ");
}

async function runAnalyticsQuery<Row>(query: string): Promise<Row[]> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_ANALYTICS_API_TOKEN) {
    return [];
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_API_TOKEN}`,
        "content-type": "text/plain;charset=utf-8",
      },
      body: `${query}\nFORMAT JSON`,
    },
  ).catch(() => null);

  if (!response?.ok) {
    console.warn("Analytics query failed", {
      status: response?.status ?? 0,
      statusText: response?.statusText ?? "fetch_error",
    });
    return [];
  }

  const payload = (await response.json().catch(() => null)) as AnalyticsQueryResult<Row> | null;
  return Array.isArray(payload?.data) ? payload.data : [];
}

function buildCumulativeSeries(
  start: Date,
  end: Date,
  input: number[],
): Array<{ bucket: string; total: number }> {
  const sorted = [...input].sort((left, right) => left - right);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  let cursor = 0;
  let runningTotal = 0;

  while (cursor < sorted.length && sorted[cursor]! < startMs) {
    runningTotal += 1;
    cursor += 1;
  }

  const series: Array<{ bucket: string; total: number }> = [];
  for (let day = startMs; day <= endMs; day += dayMs) {
    while (cursor < sorted.length && sorted[cursor]! < day + dayMs) {
      runningTotal += 1;
      cursor += 1;
    }
    series.push({
      bucket: new Date(day).toISOString().slice(0, 10),
      total: runningTotal,
    });
  }

  return series;
}

async function readGrowthSeries(
  db: DbClient,
  filters: DashboardFilters,
): Promise<{
  growthSeries: DashboardGrowthPoint[];
  totalPlayers: number;
  totalServers: number;
}> {
  const days = readPeriodDays(filters.period);
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  if (filters.server === "all") {
    const [playerRows, guildRows] = await Promise.all([
      db.select({ createdAt: players.createdAt }).from(players),
      db
        .select({ guildId: guildPlayers.guildId, createdAt: guildPlayers.createdAt })
        .from(guildPlayers),
    ]);

    const uniqueServerTimestamps = new Map<string, number>();
    for (const row of guildRows) {
      const existing = uniqueServerTimestamps.get(row.guildId);
      if (existing === undefined || row.createdAt < existing) {
        uniqueServerTimestamps.set(row.guildId, row.createdAt);
      }
    }

    const playerSeries = buildCumulativeSeries(
      start,
      end,
      playerRows.map((row) => row.createdAt),
    );
    const serverSeries = buildCumulativeSeries(start, end, [...uniqueServerTimestamps.values()]);

    return {
      growthSeries: playerSeries.map((point, index) => ({
        bucket: point.bucket,
        players: point.total,
        servers: serverSeries[index]?.total ?? 0,
      })),
      totalPlayers: playerRows.length,
      totalServers: uniqueServerTimestamps.size,
    };
  }

  const guildRosterRows = await db
    .select({
      playerId: guildPlayers.playerId,
      createdAt: guildPlayers.createdAt,
    })
    .from(guildPlayers)
    .where(eq(guildPlayers.guildId, filters.server));

  const uniquePlayerTimestamps = new Map<number, number>();
  for (const row of guildRosterRows) {
    const existing = uniquePlayerTimestamps.get(row.playerId);
    if (existing === undefined || row.createdAt < existing) {
      uniquePlayerTimestamps.set(row.playerId, row.createdAt);
    }
  }

  const playerSeries = buildCumulativeSeries(start, end, [...uniquePlayerTimestamps.values()]);
  return {
    growthSeries: playerSeries.map((point) => ({
      bucket: point.bucket,
      players: point.total,
      servers: point.total > 0 ? 1 : 0,
    })),
    totalPlayers: uniquePlayerTimestamps.size,
    totalServers: uniquePlayerTimestamps.size > 0 ? 1 : 0,
  };
}

async function buildDashboardData(db: DbClient, filters: DashboardFilters): Promise<DashboardData> {
  const analyticsConfigured = Boolean(
    env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ANALYTICS_API_TOKEN,
  );

  const where = buildAnalyticsWhere(filters);
  const optionsWhere = buildAnalyticsWhere(filters, { forOptions: true });

  const [totalsRows, usageRows, featureBarRows, featureTableRows, serverRows, featureOptionsRows] =
    await Promise.all([
      runAnalyticsQuery<TotalsRow>(
        `SELECT
          SUM(_sample_interval * double2) AS total_commands,
          SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_latency_ms,
          SUM(_sample_interval * double4) AS error_count,
          count(DISTINCT blob6) AS active_servers
        FROM parley_analytics
        WHERE ${where}`,
      ),
      runAnalyticsQuery<UsageSeriesRow>(
        `SELECT
          formatDateTime(toStartOfDay(timestamp), '%Y-%m-%d') AS bucket,
          SUM(_sample_interval * double2) AS commands,
          SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_latency_ms
        FROM parley_analytics
        WHERE ${where}
        GROUP BY bucket
        ORDER BY bucket`,
      ),
      runAnalyticsQuery<FeatureBarRow>(
        `SELECT
          blob3 AS label,
          SUM(_sample_interval * double2) AS value
        FROM parley_analytics
        WHERE ${where}
        GROUP BY label
        ORDER BY value DESC
        LIMIT 8`,
      ),
      runAnalyticsQuery<FeatureTableRow>(
        `SELECT
          blob3 AS feature,
          SUM(_sample_interval * double2) AS commands,
          SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_latency_ms,
          SUM(_sample_interval * double4) AS error_count
        FROM parley_analytics
        WHERE ${where}
        GROUP BY feature
        ORDER BY commands DESC
        LIMIT 12`,
      ),
      runAnalyticsQuery<ServerRow>(
        `SELECT
          blob6 AS guild_id,
          SUM(_sample_interval * double2) AS commands,
          SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_latency_ms
        FROM parley_analytics
        WHERE ${where} AND blob6 != 'dm'
        GROUP BY guild_id
        ORDER BY commands DESC
        LIMIT 12`,
      ),
      runAnalyticsQuery<FeatureBarRow>(
        `SELECT
          blob3 AS label,
          SUM(_sample_interval * double2) AS value
        FROM parley_analytics
        WHERE ${optionsWhere}
        GROUP BY label
        ORDER BY value DESC
        LIMIT 20`,
      ),
    ]);

  const serverOptionRows = await runAnalyticsQuery<ServerRow>(
    `SELECT
      blob6 AS guild_id,
      SUM(_sample_interval * double2) AS commands,
      SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_latency_ms
    FROM parley_analytics
    WHERE ${optionsWhere} AND blob6 != 'dm'
    GROUP BY guild_id
    ORDER BY commands DESC
    LIMIT 20`,
  );

  const { growthSeries, totalPlayers, totalServers } = await readGrowthSeries(db, filters);

  const analyticsHasData =
    totalsRows.length > 0 ||
    usageRows.length > 0 ||
    featureBarRows.length > 0 ||
    featureTableRows.length > 0 ||
    serverRows.length > 0;

  const totals = totalsRows[0];
  const totalCommands = parseNumber(totals?.total_commands);
  const avgLatencyMs = parseNumber(totals?.avg_latency_ms);
  const errorCount = parseNumber(totals?.error_count);
  const activeServers = parseNumber(totals?.active_servers);
  const errorRatePct = totalCommands > 0 ? (errorCount / totalCommands) * 100 : 0;

  const usageSeries: DashboardTimeseriesPoint[] = usageRows.map((row) => ({
    bucket: row.bucket,
    commands: parseNumber(row.commands),
    avgLatencyMs: parseNumber(row.avg_latency_ms),
  }));

  const featureBars: DashboardBarPoint[] = featureBarRows.map((row) => ({
    label: row.label,
    value: parseNumber(row.value),
  }));

  const topFeatures: DashboardFeatureRow[] = featureTableRows.map((row) => ({
    feature: row.feature,
    commands: parseNumber(row.commands),
    avgLatencyMs: parseNumber(row.avg_latency_ms),
    errorRatePct:
      parseNumber(row.commands) > 0
        ? (parseNumber(row.error_count) / parseNumber(row.commands)) * 100
        : 0,
  }));

  const topServers: DashboardServerRow[] = serverRows.map((row) => ({
    guildId: row.guild_id,
    commands: parseNumber(row.commands),
    avgLatencyMs: parseNumber(row.avg_latency_ms),
  }));

  const serverOptions: DashboardFilterOption[] = [
    { value: "all", label: "All servers" },
    ...serverOptionRows.map((row) => ({
      value: row.guild_id,
      label: row.guild_id,
    })),
  ];

  const featureOptions: DashboardFilterOption[] = [
    { value: "all", label: "All features" },
    ...featureOptionsRows.map((row) => ({
      value: row.label,
      label: row.label,
    })),
  ];

  return {
    analyticsConfigured,
    analyticsHasData,
    metrics: [
      {
        label: "Command usage",
        value: analyticsConfigured ? formatNumber(totalCommands) : "—",
        detail: analyticsConfigured
          ? `Requests in the ${readPeriodDays(filters.period)} day window`
          : "Set analytics credentials to load this metric",
      },
      {
        label: "Avg latency",
        value: analyticsConfigured ? formatLatency(avgLatencyMs) : "—",
        detail: analyticsConfigured
          ? "Weighted average from Analytics Engine"
          : "Set analytics credentials to load this metric",
      },
      {
        label: "Active servers",
        value: analyticsConfigured ? formatNumber(activeServers) : "—",
        detail: analyticsConfigured
          ? "Distinct guilds seen in the filtered window"
          : "Set analytics credentials to load this metric",
      },
      {
        label: "Error rate",
        value: analyticsConfigured ? formatPercent(errorRatePct) : "—",
        detail: analyticsConfigured
          ? "Outcome-weighted request failures"
          : "Set analytics credentials to load this metric",
      },
      {
        label: "Total linked players",
        value: formatNumber(totalPlayers),
        detail:
          filters.server === "all"
            ? "Database-backed growth baseline"
            : "Roster growth in this server",
      },
      {
        label: "Total servers",
        value: formatNumber(totalServers),
        detail:
          filters.server === "all" ? "Servers tracked in Postgres" : "Selected server visibility",
      },
    ],
    usageSeries,
    growthSeries,
    featureBars,
    topFeatures,
    topServers,
    serverOptions,
    featureOptions,
  };
}

function toPageData(
  filters: DashboardFilters,
  access: SessionAccess,
  dashboard: DashboardData | null,
): DashboardPageData {
  if (access.status === "signed_out") {
    return {
      auth: { status: "signed_out" },
      filters,
      generatedAt: new Date().toISOString(),
      dashboard,
    };
  }

  if (access.status === "forbidden") {
    return {
      auth: {
        status: "forbidden",
        discordUserId: access.discordUserId,
        userName: access.session.user.name,
      },
      filters,
      generatedAt: new Date().toISOString(),
      dashboard,
    };
  }

  return {
    auth: {
      status: "authorized",
      discordUserId: access.discordUserId,
      userName: access.session.user.name,
    },
    filters,
    generatedAt: new Date().toISOString(),
    dashboard,
  };
}

export async function getDashboardPageData(
  headers: Headers,
  rawFilters: Record<string, unknown>,
): Promise<DashboardPageData> {
  const filters = normalizeDashboardFilters(rawFilters);

  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      return toPageData(filters, access, null);
    }

    const dashboard = await buildDashboardData(db, filters).catch(() => null);
    return toPageData(filters, access, dashboard);
  }).catch(() => ({
    auth: {
      status: "signed_out",
    },
    filters,
    generatedAt: new Date().toISOString(),
    dashboard: null,
  }));
}
