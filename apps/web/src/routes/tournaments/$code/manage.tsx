import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Brackets, Play, Shield, Swords, XCircle } from "lucide-react";
import { useState } from "react";
import { DashboardLoader } from "#/components/dashboard/DashboardLoader";
import {
  bracketLabel,
  buildPlaceholderBracket,
  groupBracket,
  TournamentAuthGate,
  TournamentBracket,
  TournamentHero,
  TournamentShell,
} from "#/components/tournaments";
import { Button, buttonVariants } from "#/components/ui/button";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { useAuthMe } from "#/hooks/useAuthMe";
import { privateNoStore } from "#/lib/http-cache";
import { cn } from "#/lib/shared/cn";
import type { BracketMatchJson } from "#/lib/tournament/rpc";
import { getTournament, tournamentAction } from "#/lib/tournament/server";

export const Route = createFileRoute("/tournaments/$code/manage")({
  headers: () => privateNoStore,
  loader: async ({ params }): Promise<{
    tournament: Tournament | null;
    error: string | null;
  }> => {
    try {
      const tournament = await getTournament({ data: params.code.toUpperCase() });
      return { tournament, error: null };
    } catch (reason) {
      return {
        tournament: null,
        error: reason instanceof Error ? reason.message : "Could not load tournament",
      };
    }
  },
  component: ManageTournamentPage,
});

type Tournament = {
  id: number;
  name: string;
  format: string;
  status: string;
  publicCode: string;
  minTeams: number;
  teamCap: number;
  createdByDiscordUserId: string;
  teams: Array<{ id: number; teamName: string; status: string; seedNumber?: number }>;
  bracketMatches?: BracketMatchJson[];
};

function ManageTournamentPage() {
  const { code } = Route.useParams();
  const { tournament, error } = Route.useLoaderData();
  const { me } = useAuthMe();
  const router = useRouter();
  const [busy, setBusy] = useState<"start" | "cancel" | `report:${number}` | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const displayCode = code.toUpperCase();
  const loginRedirect = `/tournaments/${code}/manage`;

  if (!tournament) {
    return (
      <TournamentShell>
        <GlassPanel className="p-8">
          <p role="alert">{error ?? "Tournament not found"}</p>
          <Link
            to="/tournaments/$code"
            params={{ code }}
            className="mt-4 inline-block text-sm underline"
          >
            Back to event
          </Link>
        </GlassPanel>
      </TournamentShell>
    );
  }

  const isHost = me?.user.id === tournament.createdByDiscordUserId;

  return (
    <TournamentShell
      hero={
        <TournamentHero
          eyebrow="Host controls"
          title={
            <>
              Manage{" "}
              <span className="text-accent-silver font-mono tracking-wide">{displayCode}</span>
            </>
          }
          description="Review confirmed teams, start manually when ready, or cancel the event."
          meta={
            me ? (
              <div className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-accent-silver" aria-hidden />
                Host · {me.user.globalName ?? me.user.username}
              </div>
            ) : undefined
          }
        />
      }
    >
      {me === undefined ? (
        <GlassPanel className="p-8">
          <DashboardLoader label="Checking host session…" />
        </GlassPanel>
      ) : me === null ? (
        <TournamentAuthGate
          title="Host sign-in required"
          description="Log in with Discord to manage this tournament."
          redirectTo={loginRedirect}
        />
      ) : isHost ? (
        <HostControls
          tournament={tournament}
          code={code}
          busy={busy}
          error={actionError}
          onReport={reportResult}
          onAction={runAction}
        />
      ) : (
        <GlassPanel className="p-8">
          <p role="alert">Only the tournament host can manage this event.</p>
          <Link
            to="/tournaments/$code"
            params={{ code }}
            className="mt-4 inline-block text-sm underline"
          >
            Back to event
          </Link>
        </GlassPanel>
      )}
    </TournamentShell>
  );

  async function reportResult(bracketMatchId: number, winnerTeamId: number) {
    if (busy) {
      return;
    }
    setBusy(`report:${bracketMatchId}`);
    setActionError(null);
    try {
      await tournamentAction({
        data: { code: displayCode, action: "report", bracketMatchId, winnerTeamId },
      });
      await router.invalidate();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Result report failed");
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: "start" | "cancel") {
    if (busy) {
      return;
    }
    if (action === "cancel" && !window.confirm("Cancel this tournament?")) {
      return;
    }
    setBusy(action);
    setActionError(null);
    try {
      await tournamentAction({ data: { code: displayCode, action } });
      await router.invalidate();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Tournament update failed");
    } finally {
      setBusy(null);
    }
  }
}

function HostControls({
  tournament,
  code,
  busy,
  error,
  onReport,
  onAction,
}: {
  tournament: Tournament;
  code: string;
  busy: "start" | "cancel" | `report:${number}` | null;
  error: string | null;
  onReport: (bracketMatchId: number, winnerTeamId: number) => void;
  onAction: (action: "start" | "cancel") => void;
}) {
  const canStart = tournament.status === "open" && tournament.teams.length >= tournament.minTeams;
  const teamNames = new Map(tournament.teams.map((team) => [team.id, team.teamName]));
  const bracketIsLive = (tournament.bracketMatches?.length ?? 0) > 0;
  // The Go engine sizes the live bracket from the registered team count, so
  // the preview should match instead of always showing the full teamCap tree.
  const bracketSizeSource =
    tournament.teams.length >= 2 ? tournament.teams.length : tournament.teamCap;
  const bracketMatches = bracketIsLive
    ? (tournament.bracketMatches ?? [])
    : buildPlaceholderBracket({ teamCount: bracketSizeSource, format: tournament.format });
  const actionable =
    tournament.status === "in_progress"
      ? groupBracket(tournament.bracketMatches ?? [])
          .flatMap((group) => group.rounds.flatMap((round) => round.matches))
          .filter((match) => !match.winnerTeamId && match.teamAId && match.teamBId)
      : [];

  return (
    <>
      <div className="mb-6">
        <Link
          to="/tournaments/$code"
          params={{ code }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to event
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Reveal>
          <div className="space-y-6">
            <GlassPanel as="section" className="p-6 md:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-silver/15">
                  <Shield className="size-5 text-accent-silver" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Confirmed teams</p>
                  <p className="text-xs text-muted-foreground">Roster check before start</p>
                </div>
              </div>
              {tournament.teams.length > 0 ? (
                <div className="space-y-2">
                  {tournament.teams.map((team) => (
                    <div key={team.id} className="rounded-xl bg-muted/30 px-4 py-3 text-sm">
                      <span className="font-medium">{team.teamName}</span>
                      <span className="ml-2 text-muted-foreground">{team.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-5 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">No teams confirmed yet</p>
                  <Link
                    to="/tournaments/$code"
                    params={{ code }}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "mt-5 rounded-full",
                    )}
                  >
                    Open registration page
                  </Link>
                </div>
              )}
            </GlassPanel>
            <GlassPanel as="section" className="p-6 md:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-silver/15">
                  <Brackets className="size-5 text-accent-silver" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Bracket</p>
                  <p className="text-xs text-muted-foreground">
                    {bracketIsLive ? "Live tournament progression" : "Preview — fills in when the host starts"}
                  </p>
                </div>
              </div>
              <TournamentBracket matches={bracketMatches} teams={tournament.teams} />
            </GlassPanel>
            {actionable.length > 0 ? (
              <GlassPanel as="section" className="p-6 md:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-silver/15">
                    <Swords className="size-5 text-accent-silver" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Report results</p>
                    <p className="text-xs text-muted-foreground">
                      Pick the winner to advance the bracket
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {actionable.map((match) => (
                    <div key={match.id} className="rounded-xl bg-muted/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        {bracketLabel(match.bracket)} · Round {match.roundNumber} · Match{" "}
                        {match.matchNumber}
                      </p>
                      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => onReport(match.id, match.teamAId!)}
                          className="rounded-full"
                        >
                          {teamNames.get(match.teamAId!) ?? `Team ${match.teamAId}`}
                        </Button>
                        <span className="text-xs text-muted-foreground">vs</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => onReport(match.id, match.teamBId!)}
                          className="rounded-full"
                        >
                          {teamNames.get(match.teamBId!) ?? `Team ${match.teamBId}`}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            ) : null}
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="space-y-4">
            <GlassPanel className="p-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Actions
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Starting locks registration and builds the bracket.
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <Button
                  type="button"
                  size="lg"
                  disabled={!canStart || busy !== null}
                  onClick={() => onAction("start")}
                  className="h-11 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Play data-icon="inline-start" className="size-4" aria-hidden />
                  {busy === "start" ? "Starting…" : "Start tournament"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  disabled={tournament.status !== "open" || busy !== null}
                  onClick={() => onAction("cancel")}
                  className="h-11 w-full rounded-full"
                >
                  <XCircle data-icon="inline-start" className="size-4" aria-hidden />
                  {busy === "cancel" ? "Cancelling…" : "Cancel tournament"}
                </Button>
              </div>
              {!canStart && tournament.status === "open" ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Need at least {tournament.minTeams} teams to start.
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </GlassPanel>
            <GlassPanel className="p-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Status
              </p>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Phase</dt>
                  <dd>{tournament.status}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Teams</dt>
                  <dd>{tournament.teams.length}</dd>
                </div>
              </dl>
            </GlassPanel>
          </div>
        </Reveal>
      </div>
    </>
  );
}
