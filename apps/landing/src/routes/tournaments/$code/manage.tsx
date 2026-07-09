import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Play, Shield, XCircle } from "lucide-react";
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

function ManageTournamentPage() {
  const { code } = Route.useParams();
  const { me } = useAuthMe();
  const displayCode = code.toUpperCase();
  const loginRedirect = `/tournaments/${code}/manage`;

  if (me === undefined) {
    return (
      <TournamentShell>
        <DashboardLoader label="Loading session…" />
      </TournamentShell>
    );
  }

  if (!me) {
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
            description="Review confirmed teams, start the bracket when ready, or cancel the event."
          />
        }
      >
        <TournamentAuthGate
          title="Host sign-in required"
          description="Only verified hosts can start or cancel this tournament. Log in with Discord to continue."
          redirectTo={loginRedirect}
        />
      </TournamentShell>
    );
  }

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

            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">No teams confirmed yet</p>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
                Registered squads will appear here. Share the event code so players can join from
                the public tournament page.
              </p>
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
          </GlassPanel>
        </Reveal>

        <Reveal delay={80}>
          <div className="space-y-4">
            <GlassPanel className="p-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Actions
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Starting locks registration and builds the bracket. Cancelling notifies registered
                teams.
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <Button
                  type="button"
                  size="lg"
                  className="h-11 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Play data-icon="inline-start" className="size-4" aria-hidden />
                  Start tournament
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  className="h-11 w-full rounded-full"
                >
                  <XCircle data-icon="inline-start" className="size-4" aria-hidden />
                  Cancel tournament
                </Button>
              </div>
            </GlassPanel>

            <GlassPanel className="p-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Status
              </p>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Code</dt>
                  <dd className="font-mono font-medium tracking-wide text-accent-silver">
                    {displayCode}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Phase</dt>
                  <dd className="font-medium text-foreground">Registration</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Teams</dt>
                  <dd className="font-medium tabular-nums text-foreground">0</dd>
                </div>
              </dl>
            </GlassPanel>
          </div>
        </Reveal>
      </div>
    </TournamentShell>
  );
}
