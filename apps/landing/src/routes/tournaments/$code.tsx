import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Users } from "lucide-react";
import { DashboardLoader } from "#/components/dashboard/DashboardLoader";
import { TournamentHero, TournamentShell } from "#/components/tournaments";
import { Button, buttonVariants } from "#/components/ui/button";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { useAuthMe } from "#/hooks/useAuthMe";
import { cn } from "#/lib/shared/cn";

export const Route = createFileRoute("/tournaments/$code")({
  component: TournamentPage,
});

function TournamentPage() {
  const { code } = Route.useParams();
  const { me } = useAuthMe();
  const displayCode = code.toUpperCase();
  const loginRedirect = `/tournaments/${code}`;

  if (me === undefined) {
    return (
      <TournamentShell>
        <DashboardLoader label="Loading session…" />
      </TournamentShell>
    );
  }

  return (
    <TournamentShell
      hero={
        <TournamentHero
          eyebrow="Tournament"
          title={
            <>
              Event{" "}
              <span className="text-accent-silver font-mono tracking-wide">{displayCode}</span>
            </>
          }
          description="Tournament details, registered teams, and the live bracket appear here once the event is live."
          meta={
            <div className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-accent-silver" aria-hidden />
              Open for registration
            </div>
          }
        />
      }
    >
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

            {me ? (
              <div className="space-y-5">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Create a team or select an open named team with your teammates. Registration is
                  limited to members of the host server.
                </p>
                <Button
                  type="button"
                  size="lg"
                  className="h-11 rounded-full bg-foreground px-6 text-background hover:bg-foreground/90"
                >
                  Choose a team
                  <ArrowRight data-icon="inline-end" className="size-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Log in with Discord to create a team or join an open roster for this event. You
                  must be a member of the host server.
                </p>
                <Link
                  to="/auth/login"
                  search={{ redirect: loginRedirect }}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-11 rounded-full bg-foreground px-6 text-background hover:bg-foreground/90",
                  )}
                >
                  Log in with Discord to register
                  <ArrowRight data-icon="inline-end" className="size-4" aria-hidden />
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
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Share this code so teammates can open the same event page.
              </p>
            </GlassPanel>

            <GlassPanel className="p-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Bracket
              </p>
              <p className="mt-2 text-sm text-foreground">Not started</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                The live bracket unlocks after the host starts the tournament.
              </p>
            </GlassPanel>

            {me ? (
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
}
