import { useState, useEffect } from "react";
import { useNavigate, type NavigateFn } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, LogOut, Shield, TimerReset, TrendingUp } from "lucide-react";
import { authClient } from "#/lib/auth-client";
import {
  GAME_OPTIONS,
  PERIOD_OPTIONS,
  type DashboardFilterOption,
  type DashboardPageData,
} from "#/lib/dashboard";
import { useGuildAccess } from "#/hooks/use-guild-access";
import { useDashboard } from "#/components/dashboard-context";
import { AuthGuard } from "#/components/auth-guard";
import { GuildSelector } from "#/components/guild-selector";
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

function renderSignedOutState() {
  return (
    <section className="auth-panel">
      <Badge variant="outline" className="hq-badge">
        hq.parley.bot
      </Badge>
      <h1 className="auth-title">Parley HQ</h1>
      <p className="auth-copy">
        Internal analytics for command usage, latency, server activity, and bot growth. Access is
        restricted to the approved Discord identities only.
      </p>
      <p className="auth-copy" style={{ marginTop: "-0.5rem" }}>
        Administrator permission required.
      </p>
      <Button
        className="hq-button h-11 px-5"
        onClick={() =>
          authClient.signIn.social({
            provider: "discord",
            callbackURL: "/",
          })
        }
      >
        Sign in with Discord
      </Button>
    </section>
  );
}

function renderForbiddenState(data: DashboardPageData) {
  if (data.auth.status !== "forbidden") {
    return null;
  }

  return (
    <section className="auth-panel">
      <Badge variant="outline" className="hq-badge">
        Access denied
      </Badge>
      <h1 className="auth-title">{data.auth.userName}</h1>
      <p className="auth-copy">
        No admin access. You need Administrator or Manage Server permission in a Discord server.
        {data.auth.discordUserId ? ` (${data.auth.discordUserId})` : ""}
      </p>
      <Button className="hq-button h-11 px-5" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
    </section>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: DashboardFilterOption[];
}) {
  return (
    <label className="filter-block">
      <span className="filter-label">{props.label}</span>
      <Select value={props.value} onValueChange={props.onValueChange}>
        <SelectTrigger className="hq-select">
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

export function HqDashboard({ data }: { data: DashboardPageData }) {
  const navigate = useNavigate({ from: "/" });
  const [pendingFilters, setPendingFilters] = useState(data.filters);

  // Global admins skip the guild selector and go straight to the dashboard.
  // Guild admins must pick a server first (selectedGuild starts undefined).
  const isGlobalAdmin = data.auth.status === "authorized" && data.auth.isGlobalAdmin;
  const { selectedGuildId, setSelectedGuildId } = useDashboard();

  useEffect(() => {
    if (data.auth.status === "authorized" && selectedGuildId === undefined) {
      setSelectedGuildId(isGlobalAdmin ? null : undefined);
    }
  }, [data.auth.status, isGlobalAdmin, selectedGuildId, setSelectedGuildId]);

  const {
    adminGuilds,
    isGlobalAdmin: guildIsGlobalAdmin,
    isLoading,
    error,
  } = useGuildAccess(data.auth.status === "authorized");

  if (data.auth.status === "signed_out") {
    return renderSignedOutState();
  }
  if (data.auth.status === "forbidden") {
    return renderForbiddenState(data);
  }
  if (!data.dashboard) {
    return (
      <section className="auth-panel">
        <Badge variant="outline" className="hq-badge">
          Analytics offline
        </Badge>
        <h1 className="auth-title">Unable to load dashboard data</h1>
        <p className="auth-copy">
          The HQ shell is running, but the analytics or database query path did not return data.
        </p>
      </section>
    );
  }

  // Guild selection flow: if no guild selected yet, show selector
  if (selectedGuildId === undefined) {
    if (isLoading) {
      return (
        <section className="auth-panel">
          <Badge variant="outline" className="hq-badge">
            Loading
          </Badge>
          <h1 className="auth-title">Checking server access</h1>
          <p className="auth-copy">Loading your Discord server permissions...</p>
        </section>
      );
    }

    if (error) {
      return (
        <section className="auth-panel">
          <Badge variant="outline" className="hq-badge">
            Error
          </Badge>
          <h1 className="auth-title">Could not load server access</h1>
          <p className="auth-copy">
            Failed to retrieve your Discord server list. Please try again.
          </p>
        </section>
      );
    }

    // If user has no admin guilds and is not global admin, show forbidden
    if (adminGuilds.length === 0 && !guildIsGlobalAdmin) {
      return (
        <section className="auth-panel">
          <Badge variant="outline" className="hq-badge">
            Access denied
          </Badge>
          <h1 className="auth-title">No admin access</h1>
          <p className="auth-copy">
            No admin access. You need Administrator or Manage Server permission in a Discord server.
          </p>
          <Button className="hq-button h-11 px-5" onClick={() => authClient.signOut()}>
            Sign out
          </Button>
        </section>
      );
    }

    return (
      <GuildSelector
        adminGuilds={adminGuilds}
        isGlobalAdmin={guildIsGlobalAdmin}
        onSelect={(guildId) => setSelectedGuildId(guildId)}
      />
    );
  }

  // Guild selected — wrap dashboard in auth guard
  return (
    <AuthGuard guildId={selectedGuildId}>
      <DashboardContent
        data={data}
        pendingFilters={pendingFilters}
        setPendingFilters={setPendingFilters}
        onBackToGuilds={() => setSelectedGuildId(undefined)}
      />
    </AuthGuard>
  );
}

function DashboardContent({
  data,
  pendingFilters,
  setPendingFilters,
  onBackToGuilds,
}: {
  data: DashboardPageData;
  pendingFilters: typeof data.filters;
  setPendingFilters: React.Dispatch<React.SetStateAction<typeof data.filters>>;
  onBackToGuilds: () => void;
}) {
  const navigate = useNavigate({ from: "/" });
  if (data.auth.status !== "authorized" || !data.dashboard) {
    return null;
  }

  const usageChartConfig = {
    commands: {
      label: "Commands",
      color: "var(--color-chart-1)",
    },
    avgLatencyMs: {
      label: "Avg latency",
      color: "var(--color-chart-2)",
    },
  } satisfies ChartConfig;

  const growthChartConfig = {
    players: {
      label: "Players",
      color: "var(--color-chart-3)",
    },
    servers: {
      label: "Servers",
      color: "var(--color-chart-4)",
    },
  } satisfies ChartConfig;

  const featureChartConfig = {
    value: {
      label: "Usage",
      color: "var(--color-chart-1)",
    },
  } satisfies ChartConfig;

  return (
    <main className="hq-shell">
      <section className="hq-header">
        <div>
          <Badge variant="outline" className="hq-badge">
            Parley HQ
          </Badge>
          <h1 className="hq-title">Bot analytics and operational telemetry</h1>
          <p className="hq-subtitle">
            Command usage, latency, feature distribution, and growth trends sourced from Analytics
            Engine and the current Postgres model.
          </p>
        </div>
        <div className="hq-actions">
          <Button variant="outline" className="hq-button" onClick={onBackToGuilds}>
            <ArrowLeft size={14} />
            Servers
          </Button>
          <Badge variant="outline" className="hq-chip">
            <Shield size={14} />
            {data.auth.discordUserId}
          </Badge>
          <Badge variant="outline" className="hq-chip">
            <TimerReset size={14} />
            {new Date(data.generatedAt).toLocaleString()}
          </Badge>
          <Button variant="outline" className="hq-button" onClick={() => authClient.signOut()}>
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </section>

      <section className="hq-filters">
        <FilterSelect
          label="Date"
          value={pendingFilters.period}
          onValueChange={(value) =>
            setPendingFilters((current) => ({ ...current, period: value as never }))
          }
          options={PERIOD_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <FilterSelect
          label="Server"
          value={pendingFilters.server}
          onValueChange={(value) => setPendingFilters((current) => ({ ...current, server: value }))}
          options={data.dashboard.serverOptions}
        />
        <FilterSelect
          label="Game"
          value={pendingFilters.game}
          onValueChange={(value) =>
            setPendingFilters((current) => ({ ...current, game: value as never }))
          }
          options={GAME_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <FilterSelect
          label="Feature"
          value={pendingFilters.feature}
          onValueChange={(value) =>
            setPendingFilters((current) => ({ ...current, feature: value }))
          }
          options={data.dashboard.featureOptions}
        />
        <div className="filter-actions">
          <Button className="hq-button" onClick={() => navigate({ search: pendingFilters })}>
            Apply filters
          </Button>
          <Button
            variant="outline"
            className="hq-button"
            onClick={() => {
              const next = {
                period: "30d" as const,
                server: "all",
                game: "all" as const,
                feature: "all",
              };
              setPendingFilters(next);
              navigate({ search: next });
            }}
          >
            Reset
          </Button>
        </div>
      </section>

      <section className="kpi-grid">
        {data.dashboard.metrics.map((metric) => (
          <Card key={metric.label} className="hq-card">
            <CardHeader className="space-y-2">
              <CardDescription className="hq-card-label">{metric.label}</CardDescription>
              <CardTitle className="hq-card-value">{metric.value}</CardTitle>
            </CardHeader>
            <CardContent className="hq-card-detail">{metric.detail}</CardContent>
          </Card>
        ))}
      </section>
      {!data.dashboard.analyticsConfigured ? (
        <section className="auth-panel">
          <Badge variant="outline" className="hq-badge">
            Analytics not configured
          </Badge>
          <p className="auth-copy">
            Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ANALYTICS_API_TOKEN` in `apps/hq/.dev.vars`
            to load command and latency analytics.
          </p>
        </section>
      ) : null}
      {data.dashboard.analyticsConfigured && !data.dashboard.analyticsHasData ? (
        <section className="auth-panel">
          <Badge variant="outline" className="hq-badge">
            No analytics data
          </Badge>
          <p className="auth-copy">
            Analytics Engine is configured, but no matching datapoints were found for the active
            filters.
          </p>
        </section>
      ) : null}

      <section className="chart-grid">
        <Card className="hq-card">
          <CardHeader>
            <CardTitle>Command usage trend</CardTitle>
            <CardDescription>Daily command volume inside the active filter window.</CardDescription>
          </CardHeader>
          <CardContent className="chart-panel">
            <ChartContainer config={usageChartConfig} className="hq-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dashboard.usageSeries}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="commands"
                    stroke="var(--color-commands)"
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
            <CardTitle>Latency trend</CardTitle>
            <CardDescription>
              Weighted average request duration from bot analytics events.
            </CardDescription>
          </CardHeader>
          <CardContent className="chart-panel">
            <ChartContainer config={usageChartConfig} className="hq-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dashboard.usageSeries}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="avgLatencyMs"
                    stroke="var(--color-avgLatencyMs)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      <section className="chart-grid">
        <Card className="hq-card">
          <CardHeader>
            <CardTitle>Feature usage</CardTitle>
            <CardDescription>
              Highest-traffic command surfaces in the current slice.
            </CardDescription>
          </CardHeader>
          <CardContent className="chart-panel">
            <ChartContainer config={featureChartConfig} className="hq-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dashboard.featureBars}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={0} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="hq-card">
          <CardHeader>
            <CardTitle>Bot growth</CardTitle>
            <CardDescription>
              Players and servers accumulated from current Postgres state.
            </CardDescription>
          </CardHeader>
          <CardContent className="chart-panel">
            <ChartContainer config={growthChartConfig} className="hq-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dashboard.growthSeries}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="players"
                    stroke="var(--color-players)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="servers"
                    stroke="var(--color-servers)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      <section className="table-grid">
        <Card className="hq-card">
          <CardHeader>
            <CardTitle>Top features</CardTitle>
            <CardDescription>Usage, latency, and error rate by feature key.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Error rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dashboard.topFeatures.map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell>{row.feature}</TableCell>
                      <TableCell>{formatNumber(row.commands)}</TableCell>
                      <TableCell>{formatLatency(row.avgLatencyMs)}</TableCell>
                      <TableCell>{formatPercent(row.errorRatePct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="hq-card">
          <CardHeader>
            <CardTitle>Top servers</CardTitle>
            <CardDescription>
              Most active guilds by command volume in the current filter set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guild ID</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dashboard.topServers.map((row) => (
                    <TableRow key={row.guildId}>
                      <TableCell>{row.guildId}</TableCell>
                      <TableCell>{formatNumber(row.commands)}</TableCell>
                      <TableCell>{formatLatency(row.avgLatencyMs)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="hq-footer">
        <TrendingUp size={14} />
        <span>
          Analytics Engine for request telemetry. Postgres for growth and roster baselines.
        </span>
      </section>
    </main>
  );
}
