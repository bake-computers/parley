import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getGuildTournaments, getTournamentDetail } from "#/lib/server/tournaments";
import { AuthGuard } from "#/components/auth-guard";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "#/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "#/components/ui/table";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Copy, Eye, Trophy, Users, Sword, ChevronLeft, Check } from "lucide-react";

const loadGuildTournaments = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return getGuildTournaments(getRequestHeaders(), data.guildId);
  });

const loadTournamentDetail = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    const raw = input.tournamentId;
    const tournamentId =
      typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
    if (Number.isNaN(tournamentId)) throw new Error("tournamentId required");
    return { tournamentId };
  })
  .handler(async ({ data }) => {
    return getTournamentDetail(getRequestHeaders(), data.tournamentId);
  });

export const Route = createFileRoute("/guild/$guildId/tournaments")({
  loader: ({ params }) => loadGuildTournaments({ data: { guildId: params.guildId } }),
  component: GuildTournamentsRoute,
});

function formatTournamentFormatLabel(format: string): string {
  return format === "double" ? "Double Elimination" : "Single Elimination";
}

function formatTournamentStatusLabel(status: string): string {
  switch (status) {
    case "open":
      return "Open";
    case "full_pending_start":
      return "Full, Pending Start";
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function getStatusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "open":
      return "outline";
    case "full_pending_start":
      return "default";
    case "active":
      return "secondary";
    case "completed":
      return "default";
    case "cancelled":
      return "destructive";
    default:
      return "default";
  }
}

type TournamentDetail = NonNullable<Awaited<ReturnType<typeof loadTournamentDetail>>>;

function GuildTournamentsRoute() {
  const { guildId } = Route.useParams();
  const tournaments = Route.useLoaderData();
  const [selectedTournament, setSelectedTournament] = useState<TournamentDetail | null>(null);
  const [copied, setCopied] = useState(false);

  const handleViewTournament = async (tournamentId: number) => {
    const detail = await loadTournamentDetail({ data: { tournamentId } });
    if (detail) {
      setSelectedTournament(detail);
    }
  };

  const handleCopyCommand = async () => {
    const command = "/tournament create <name> <format> <team_cap>";
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (selectedTournament) {
    return (
      <AuthGuard guildId={guildId}>
        <TournamentDetailView
          tournament={selectedTournament}
          onBack={() => setSelectedTournament(null)}
        />
      </AuthGuard>
    );
  }

  return (
    <AuthGuard guildId={guildId}>
      <div className="hq-shell">
        <div className="hq-header">
          <div>
            <h1 className="hq-title">Tournaments</h1>
            <p className="hq-subtitle">Active and past tournaments for this server.</p>
          </div>
        </div>

        <div className="table-grid grid-cols-1">
          <Card className="hq-card">
            <CardHeader>
              <CardTitle className="text-base">Create Tournament</CardTitle>
              <CardDescription>Tournaments are created via Discord commands.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 rounded border border-white/10 bg-depth-2 p-3 font-mono text-sm">
                <code className="flex-1 text-white/80">
                  /tournament create &lt;name&gt; &lt;format&gt; &lt;team_cap&gt;
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="hq-button shrink-0"
                  onClick={handleCopyCommand}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="space-y-1 text-sm text-white/60">
                <p className="font-medium text-white/80">Formats</p>
                <p>
                  <span className="font-mono text-white/70">single</span> — Single Elimination. One
                  loss and you&apos;re out.
                </p>
                <p>
                  <span className="font-mono text-white/70">double</span> — Double Elimination. Two
                  losses to eliminate.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="hq-card mt-6">
          <CardHeader>
            <CardTitle className="text-base">Tournament List</CardTitle>
            <CardDescription>
              {tournaments.length === 0
                ? "No tournaments found for this server."
                : `Showing ${tournaments.length} tournament${tournaments.length === 1 ? "" : "s"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tournaments.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{formatTournamentFormatLabel(t.format)}</TableCell>
                    <TableCell>
                      {t.entryCount} / {t.teamCap}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(t.status)}>
                        {formatTournamentStatusLabel(t.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => handleViewTournament(t.id)}
                      >
                        <Eye size={14} />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {tournaments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-white/50">
                      No tournaments yet. Use the Discord command above to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}

function TournamentDetailView({
  tournament,
  onBack,
}: {
  tournament: TournamentDetail;
  onBack: () => void;
}) {
  const { tournament: t, entries, bracketMatches } = tournament;

  const bracketGroups = bracketMatches.reduce(
    (acc, match) => {
      const key =
        match.bracket === "grand_final"
          ? "Grand Final"
          : `${match.bracket === "upper" ? "Upper" : "Lower"} Bracket`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(match);
      return acc;
    },
    {} as Record<string, typeof bracketMatches>,
  );

  const statusSteps = ["open", "full_pending_start", "active", "completed"];
  const currentStepIndex = statusSteps.indexOf(t.status);
  const isCancelled = t.status === "cancelled";

  return (
    <div className="hq-shell">
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onBack}>
          <ChevronLeft size={14} />
          Back to tournaments
        </Button>
      </div>

      <div className="hq-header">
        <div>
          <h1 className="hq-title">{t.name}</h1>
          <p className="hq-subtitle">
            {formatTournamentFormatLabel(t.format)} · {entries.length} / {t.teamCap} teams
          </p>
        </div>
        <div className="hq-actions">
          <Badge variant={getStatusBadgeVariant(t.status)} className="hq-badge">
            {formatTournamentStatusLabel(t.status)}
          </Badge>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {statusSteps.map((step, i) => {
            const label = formatTournamentStatusLabel(step);
            const isActive = i === currentStepIndex && !isCancelled;
            const isDone = i < currentStepIndex && !isCancelled;
            return (
              <div key={step} className="flex items-center gap-2">
                <Badge
                  variant={
                    isCancelled && i === currentStepIndex
                      ? "destructive"
                      : isActive
                        ? "default"
                        : isDone
                          ? "secondary"
                          : "outline"
                  }
                  className="hq-badge"
                >
                  {isDone ? <Check size={12} /> : null}
                  {label}
                </Badge>
                {i < statusSteps.length - 1 && <span className="text-white/20">→</span>}
              </div>
            );
          })}
          {isCancelled && (
            <>
              <span className="text-white/20">→</span>
              <Badge variant="destructive" className="hq-badge">
                Cancelled
              </Badge>
            </>
          )}
        </div>
      </div>

      <div className="table-grid grid-cols-1 lg:grid-cols-2">
        <Card className="hq-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users size={16} />
              Entries
            </CardTitle>
            <CardDescription>Teams registered for this tournament.</CardDescription>
          </CardHeader>
          <CardContent className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seed</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Captain</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-white/70">
                      {entry.seedNumber ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{entry.teamName}</TableCell>
                    <TableCell className="text-white/70">
                      <code className="text-xs">{entry.captainDiscordUserId}</code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          entry.status === "eliminated"
                            ? "destructive"
                            : entry.status === "champion"
                              ? "default"
                              : "outline"
                        }
                        className="hq-badge"
                      >
                        {entry.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-white/50">
                      No entries yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="hq-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sword size={16} />
              Bracket
            </CardTitle>
            <CardDescription>Match progression and results.</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(bracketGroups).length === 0 ? (
              <p className="py-6 text-center text-white/50">No bracket matches yet.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(bracketGroups).map(([groupName, matches]) => (
                  <div key={groupName}>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
                      {groupName}
                    </p>
                    <div className="space-y-2">
                      {matches.map((match) => (
                        <div
                          key={match.id}
                          className="flex items-center justify-between rounded border border-white/10 bg-depth-2 px-3 py-2"
                        >
                          <div className="flex flex-1 items-center gap-2 text-sm">
                            <span className="font-mono text-xs text-white/40">
                              R{match.roundNumber}M{match.matchNumber}
                            </span>
                            <span
                              className={
                                match.winnerEntryId === match.entryAId
                                  ? "font-medium text-white"
                                  : "text-white/70"
                              }
                            >
                              {match.entryATeamName ?? "TBD"}
                            </span>
                            <span className="text-white/30">vs</span>
                            <span
                              className={
                                match.winnerEntryId === match.entryBId
                                  ? "font-medium text-white"
                                  : "text-white/70"
                              }
                            >
                              {match.entryBTeamName ?? "TBD"}
                            </span>
                          </div>
                          {match.winnerEntryId ? (
                            <Badge variant="secondary" className="hq-badge">
                              <Trophy size={10} />
                              {match.winnerEntryId === match.entryAId
                                ? match.entryATeamName
                                : match.entryBTeamName}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="hq-badge">
                              Pending
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
