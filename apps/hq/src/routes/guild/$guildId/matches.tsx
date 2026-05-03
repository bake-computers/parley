import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { getMatchHistory, getMatchAnalytics } from "#/lib/server/match-history";
import { AuthGuard } from "#/components/auth-guard";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";

const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
] as const;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const RESULT_OPTIONS = [
  { value: "all", label: "All results" },
  { value: "A", label: "Team A won" },
  { value: "B", label: "Team B won" },
  { value: "draw", label: "Draw / Unresolved" },
] as const;

interface MatchesSearch {
  period: string;
  status: string;
  result: string;
  search: string;
  page: number;
}

function normalizeMatchesSearch(search: Record<string, unknown>): MatchesSearch {
  const period = PERIOD_OPTIONS.find((o) => o.value === search.period)?.value ?? "30d";
  const status = STATUS_OPTIONS.find((o) => o.value === search.status)?.value ?? "all";
  const result = RESULT_OPTIONS.find((o) => o.value === search.result)?.value ?? "all";
  const searchText = typeof search.search === "string" ? search.search : "";
  const page =
    typeof search.page === "number"
      ? Math.max(1, search.page)
      : typeof search.page === "string"
        ? Math.max(1, parseInt(search.page, 10) || 1)
        : 1;

  return { period, status, result, search: searchText, page };
}

const loadMatchHistory = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    const search = normalizeMatchesSearch(input);
    return {
      guildId: input.guildId,
      period: search.period,
      status: search.status,
      result: search.result,
      search: search.search,
      page: search.page,
    };
  })
  .handler(async ({ data }) => {
    const limit = 25;
    const offset = (data.page - 1) * limit;
    return getMatchHistory(getRequestHeaders(), data.guildId, {
      period: data.period,
      status: data.status === "all" ? undefined : data.status,
      winningTeam: data.result === "all" ? undefined : data.result,
      search: data.search || undefined,
      limit,
      offset,
    });
  });

const loadMatchAnalytics = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    const search = normalizeMatchesSearch(input);
    return {
      guildId: input.guildId,
      period: search.period,
    };
  })
  .handler(async ({ data }) => {
    return getMatchAnalytics(getRequestHeaders(), data.guildId, data.period);
  });

export const Route = createFileRoute("/guild/$guildId/matches")({
  validateSearch: (search) => normalizeMatchesSearch(search),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    Promise.all([
      loadMatchHistory({ data: { guildId: params.guildId, ...deps } }),
      loadMatchAnalytics({ data: { guildId: params.guildId, period: deps.period } }),
    ]),
  component: GuildMatchesRoute,
});

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusBadgeVariant(status: string): React.ComponentProps<typeof Badge>["variant"] {
  switch (status) {
    case "completed":
      return "default";
    case "pending":
      return "secondary";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

const eloTrendConfig = {
  avgElo: {
    label: "Avg ELO",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig;

const winRateConfig = {
  value: {
    label: "Matches",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig;

const matchesPerDayConfig = {
  count: {
    label: "Matches",
    color: "var(--color-chart-3)",
  },
} satisfies ChartConfig;

const topPlayersConfig = {
  eloGain: {
    label: "ELO Gain",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig;

const PIE_COLORS = ["var(--color-chart-1)", "var(--color-chart-3)", "var(--color-chart-4)"];

function FilterSelect(props: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="filter-block">
      <span className="filter-label">{props.label}</span>
      <Select value={props.value} onValueChange={props.onValueChange}>
        <SelectTrigger className="hq-select w-full">
          <SelectValue placeholder={props.label} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function GuildMatchesRoute() {
  const { guildId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [historyData, analyticsData] = Route.useLoaderData();

  const [pendingFilters, setPendingFilters] = useState<MatchesSearch>(search);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(historyData.total / 25)),
    [historyData.total],
  );

  const canGoPrev = search.page > 1;
  const canGoNext = search.page < totalPages;

  const applyFilters = () => {
    navigate({
      search: { ...pendingFilters, page: 1 },
    });
  };

  const resetFilters = () => {
    const reset: MatchesSearch = {
      period: "30d",
      status: "all",
      result: "all",
      search: "",
      page: 1,
    };
    setPendingFilters(reset);
    navigate({ search: reset });
  };

  const goToPage = (page: number) => {
    navigate({ search: { ...search, page } });
  };

  return (
    <AuthGuard guildId={guildId}>
      <main className="hq-shell">
        <section className="hq-header">
          <div>
            <Badge variant="outline" className="hq-badge">
              Match History
            </Badge>
            <h1 className="hq-title">Matches & Analytics</h1>
            <p className="hq-subtitle">
              Review match history, team performance, and ELO trends for this server.
            </p>
          </div>
        </section>

        <section className="hq-filters grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <FilterSelect
            label="Period"
            value={pendingFilters.period}
            onValueChange={(value) => setPendingFilters((prev) => ({ ...prev, period: value }))}
            options={PERIOD_OPTIONS}
          />
          <FilterSelect
            label="Status"
            value={pendingFilters.status}
            onValueChange={(value) => setPendingFilters((prev) => ({ ...prev, status: value }))}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Result"
            value={pendingFilters.result}
            onValueChange={(value) => setPendingFilters((prev) => ({ ...prev, result: value }))}
            options={RESULT_OPTIONS}
          />
          <label className="filter-block">
            <span className="filter-label">Search</span>
            <input
              type="text"
              value={pendingFilters.search}
              onChange={(e) => setPendingFilters((prev) => ({ ...prev, search: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Player name..."
              className="hq-select h-9 w-full px-3 py-2 text-sm"
            />
          </label>
          <div className="filter-actions">
            <Button className="hq-button" onClick={applyFilters}>
              Apply
            </Button>
            <Button variant="outline" className="hq-button" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </section>

        <section className="chart-grid">
          <Card className="hq-card">
            <CardHeader>
              <CardTitle>ELO Trend</CardTitle>
              <CardDescription>Average team seed ELO over the selected period.</CardDescription>
            </CardHeader>
            <CardContent className="chart-panel">
              <ChartContainer config={eloTrendConfig} className="hq-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analyticsData.eloTrend}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={20}
                    />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => formatShortDate(String(label))}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="avgElo"
                      stroke="var(--color-avgElo)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="hq-card">
            <CardHeader>
              <CardTitle>Win Rate</CardTitle>
              <CardDescription>Match outcomes by winning team.</CardDescription>
            </CardHeader>
            <CardContent className="chart-panel">
              <ChartContainer config={winRateConfig} className="hq-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={analyticsData.winRate}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="80%"
                      label={({ name, percent }) =>
                        `${name}: ${typeof percent === "number" ? (percent * 100).toFixed(0) : 0}%`
                      }
                    >
                      {analyticsData.winRate.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </section>

        <section className="chart-grid">
          <Card className="hq-card">
            <CardHeader>
              <CardTitle>Matches Per Day</CardTitle>
              <CardDescription>Daily match volume over the selected period.</CardDescription>
            </CardHeader>
            <CardContent className="chart-panel">
              <ChartContainer config={matchesPerDayConfig} className="hq-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.matchesPerDay}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={12}
                    />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => formatShortDate(String(label))}
                        />
                      }
                    />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="hq-card">
            <CardHeader>
              <CardTitle>Top Players by ELO Gain</CardTitle>
              <CardDescription>Estimated ELO change over the last 7 days.</CardDescription>
            </CardHeader>
            <CardContent className="chart-panel">
              <ChartContainer config={topPlayersConfig} className="hq-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analyticsData.topPlayers}
                    layout="vertical"
                    margin={{ left: 16, right: 16 }}
                  >
                    <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.08)" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis
                      dataKey="username"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      width={100}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="eloGain" fill="var(--color-eloGain)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </section>

        <section className="table-grid">
          <Card className="hq-card col-span-2">
            <CardHeader>
              <CardTitle>Match History</CardTitle>
              <CardDescription>
                {historyData.total} total match{historyData.total === 1 ? "" : "es"} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Teams</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>ELO Delta</TableHead>
                      <TableHead>Resolution</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyData.matches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          No matches found for the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historyData.matches.map((match) => (
                        <TableRow key={match.id}>
                          <TableCell>{formatDate(match.createdAt)}</TableCell>
                          <TableCell>
                            A ({match.playerCount > 0 ? Math.round(match.teamASeedTotal) : "-"}) vs
                            B ({match.playerCount > 0 ? Math.round(match.teamBSeedTotal) : "-"})
                          </TableCell>
                          <TableCell>
                            {match.teamAKills} - {match.teamBKills}
                          </TableCell>
                          <TableCell>
                            {match.winningTeam
                              ? `${match.winningTeam === "A" ? "+" : "-"}${Math.round(match.seedGap)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="capitalize">{match.resolutionType}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(match.status)}>{match.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {historyData.total > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Page {search.page} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="hq-button"
                      disabled={!canGoPrev}
                      onClick={() => goToPage(search.page - 1)}
                    >
                      Previous
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (search.page <= 3) {
                        pageNum = i + 1;
                      } else if (search.page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = search.page - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={search.page === pageNum ? "default" : "outline"}
                          size="sm"
                          className="hq-button min-w-[2.5rem]"
                          onClick={() => goToPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      className="hq-button"
                      disabled={!canGoNext}
                      onClick={() => goToPage(search.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </AuthGuard>
  );
}
