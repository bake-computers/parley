import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Brackets, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { DashboardLoader } from "#/components/dashboard/DashboardLoader";
import {
  PlayerPicker,
  TournamentBracket,
  TournamentHero,
  TournamentShell,
} from "#/components/tournaments";
import { Button, buttonVariants } from "#/components/ui/button";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { useAuthMe } from "#/hooks/useAuthMe";
import { cn } from "#/lib/shared/cn";
import type { BracketMatchJson } from "#/lib/tournament/rpc";
import { getTournament, tournamentAction } from "#/lib/tournament/server";

export const Route = createFileRoute("/tournaments/$code")({ component: TournamentPage });

type Tournament = {
  id: number;
  name: string;
  format: string;
  status: string;
  publicCode: string;
  teamCap: number;
  createdByDiscordUserId: string;
  teams: Array<{ id: number; teamName: string; status: string }>;
  bracketMatches?: BracketMatchJson[];
};

function TournamentPage() {
  const { code } = Route.useParams();
  const { me } = useAuthMe();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRegistration, setShowRegistration] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rosterIds, setRosterIds] = useState<string[]>([]);
  const displayCode = code.toUpperCase();
  const loginRedirect = `/tournaments/${code}`;

  useEffect(() => {
    let cancelled = false;
    getTournament({ data: displayCode })
      .then((tournament) => !cancelled && setTournament(tournament))
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

  useEffect(() => {
    if (me) {setRosterIds((ids) => (ids.length ? ids : [me.user.id]));}
  }, [me]);

  if (me === undefined || loading)
    {return (
      <TournamentShell>
        <DashboardLoader label="Loading tournament…" />
      </TournamentShell>
    );}
  if (!tournament)
    {return (
      <TournamentShell>
        <GlassPanel className="p-8">
          <p role="alert">{error ?? "Tournament not found"}</p>
        </GlassPanel>
      </TournamentShell>
    );}
  const isHost = me?.user.id === tournament.createdByDiscordUserId;

  return (
    <TournamentShell
      hero={
        <TournamentHero
          eyebrow="Tournament"
          title={
            <>
              <span className="text-accent-silver">{tournament.name}</span>
            </>
          }
          description={`${tournament.format} · ${tournament.teams.length}/${tournament.teamCap} teams`}
          meta={
            <div className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-accent-silver" aria-hidden />
              {tournament.status === "open" ? "Open for registration" : tournament.status}
            </div>
          }
        />
      }
    >
      {tournament.bracketMatches?.length ? (
        <Reveal className="mb-6">
          <GlassPanel as="section" className="p-6 md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="bg-accent-silver/15 flex size-10 items-center justify-center rounded-2xl">
                <Brackets className="text-accent-silver size-5" aria-hidden />
              </div>
              <div>
                <p className="text-foreground text-sm font-medium">Bracket</p>
                <p className="text-muted-foreground text-xs">Who plays whom, updated live</p>
              </div>
            </div>
            <TournamentBracket matches={tournament.bracketMatches} teams={tournament.teams} />
          </GlassPanel>
        </Reveal>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Reveal>
          <GlassPanel className="p-6 md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-silver/15">
                <Users className="size-5 text-accent-silver" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Teams & registration</p>
                <p className="text-xs text-muted-foreground">Host-server members only</p>
              </div>
            </div>
            {tournament.teams.length > 0 ? (
              <div className="mb-5 space-y-2">
                {tournament.teams.map((team) => (
                  <p
                    key={team.id}
                    className="rounded-xl bg-muted/30 px-3 py-2 text-sm text-foreground"
                  >
                    {team.teamName}
                  </p>
                ))}
              </div>
            ) : null}
            {me ? (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Register a complete roster for this event. Hosts can register a team too, or
                  manage the event without joining.
                </p>
                {showRegistration ? (
                  <form
                    className="grid gap-3 rounded-2xl border border-border/60 p-4"
                    onSubmit={registerTeam}
                  >
                    <input
                      required
                      name="teamName"
                      placeholder="Team name"
                      className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    />
                    <PlayerPicker
                      code={displayCode}
                      currentUserId={me.user.id}
                      selectedIds={rosterIds}
                      onChange={setRosterIds}
                      rosterSize={rosterSizeFromFormat(tournament.format)}
                    />
                    <div className="flex gap-2">
                      <Button type="submit" disabled={submitting || rosterIds.length === 0}>
                        {submitting ? "Registering…" : "Register team"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowRegistration(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                    {error ? (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                  </form>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    disabled={tournament.status !== "open"}
                    onClick={() => {
                      setError(null);
                      setShowRegistration(true);
                    }}
                    className="h-11 rounded-full bg-foreground px-6 text-background hover:bg-foreground/90"
                  >
                    Choose a team{" "}
                    <ArrowRight data-icon="inline-end" className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Log in with Discord to register.</p>
                <Link
                  to="/auth/login"
                  search={{ redirect: loginRedirect }}
                  className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
                >
                  Log in with Discord
                </Link>
              </div>
            )}
          </GlassPanel>
        </Reveal>
        <Reveal delay={80}>
          <div className="space-y-4">
            <GlassPanel className="p-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Code
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tracking-wider text-accent-silver">
                {displayCode}
              </p>
            </GlassPanel>
            <GlassPanel className="p-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Bracket
              </p>
              <p className="mt-2 text-sm text-foreground">
                {tournament.status === "open" ? "Not started" : tournament.status}
              </p>
            </GlassPanel>
            {isHost ? (
              <Link
                to="/tournaments/$code/manage"
                params={{ code }}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-10 w-full rounded-full border-border/70",
                )}
              >
                Manage event
              </Link>
            ) : null}
          </div>
        </Reveal>
      </div>
    </TournamentShell>
  );

  async function registerTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {return;}
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      await tournamentAction({
        data: {
          code: displayCode,
          action: "register",
          teamName: String(form.get("teamName") ?? ""),
          discordUserIds: rosterIds,
        },
      });
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Team registration failed");
      setSubmitting(false);
    }
  }
}

/** "5v5_single_elimination" → 5. */
function rosterSizeFromFormat(format: string): number | undefined {
  const size = Number(format.match(/^(\d+)v\d+/)?.[1]);
  return size > 0 ? size : undefined;
}
