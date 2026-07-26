import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Play, Shield, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { DashboardLoader } from "#/components/dashboard/DashboardLoader";
import { TournamentAuthGate, TournamentHero, TournamentShell } from "#/components/tournaments";
import { Button, buttonVariants } from "#/components/ui/button";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { useAuthMe } from "#/hooks/useAuthMe";
import { cn } from "#/lib/shared/cn";

export const Route = createFileRoute("/tournaments/$code/manage")({
  component: ManageTournamentPage,
});

type Tournament = {
  id: number;
  name: string;
  status: string;
  publicCode: string;
  minTeams: number;
  createdByDiscordUserId: string;
  teams: Array<{ id: number; teamName: string; status: string }>;
};

function ManageTournamentPage() {
  const { code } = Route.useParams();
  const { me } = useAuthMe();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"start" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayCode = code.toUpperCase();
  const loginRedirect = `/tournaments/${code}/manage`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tournaments/${encodeURIComponent(displayCode)}`, { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as { tournament?: Tournament; error?: string };
        if (!res.ok || !data.tournament) throw new Error(data.error ?? "Could not load tournament");
        if (!cancelled) setTournament(data.tournament);
      })
      .catch(
        (reason) =>
          !cancelled &&
          setError(reason instanceof Error ? reason.message : "Could not load tournament"),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [displayCode]);

  if (me === undefined || loading)
    return (
      <TournamentShell>
        <DashboardLoader label="Loading tournament…" />
      </TournamentShell>
    );
  if (!me)
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
            description="Review teams and control the event."
          />
        }
      >
        <TournamentAuthGate
          title="Host sign-in required"
          description="Log in with Discord to manage this tournament."
          redirectTo={loginRedirect}
        />
      </TournamentShell>
    );
  if (!tournament || tournament.createdByDiscordUserId !== me.user.id)
    return (
      <TournamentShell>
        <GlassPanel className="p-8">
          <p role="alert">{error ?? "Only the tournament host can manage this event."}</p>
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
  const canStart = tournament.status === "open" && tournament.teams.length >= tournament.minTeams;

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
            <div className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-accent-silver" aria-hidden />
              Host · {me.user.globalName ?? me.user.username}
            </div>
          }
        />
      }
    >
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
            {tournament.teams.length ? (
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
                  onClick={() => runAction("start")}
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
                  onClick={() => runAction("cancel")}
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
    </TournamentShell>
  );

  async function runAction(action: "start" | "cancel") {
    if (busy) return;
    if (action === "cancel" && !window.confirm("Cancel this tournament?")) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${encodeURIComponent(displayCode)}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { tournament?: Tournament; error?: string };
      if (!res.ok || !data.tournament) throw new Error(data.error ?? "Tournament update failed");
      setTournament(data.tournament);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Tournament update failed");
    } finally {
      setBusy(null);
    }
  }
}
