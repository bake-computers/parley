import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Trophy } from "lucide-react";
import { useState } from "react";
import { DashboardLoader } from "#/components/dashboard/DashboardLoader";
import {
  TournamentAuthGate,
  TournamentField,
  TournamentHero,
  TournamentInput,
  TournamentSelect,
  TournamentShell,
  TournamentTextarea,
} from "#/components/tournaments";
import { Button } from "#/components/ui/button";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { useAuthMe } from "#/hooks/useAuthMe";

export const Route = createFileRoute("/tournaments/create")({
  component: CreateTournamentPage,
});

const FORMAT_OPTIONS = [
  { value: "5v5_single_elimination", label: "5v5 · Single elimination" },
  { value: "5v5_double_elimination", label: "5v5 · Double elimination" },
  { value: "3v3_single_elimination", label: "3v3 · Single elimination" },
  { value: "2v2_single_elimination", label: "2v2 · Single elimination" },
  { value: "1v1_single_elimination", label: "1v1 · Single elimination" },
] as const;

function CreateTournamentPage() {
  const { handoff } = Route.useSearch() as { handoff?: string };
  const { me } = useAuthMe();
  const [submitted, setSubmitted] = useState(false);
  const loginRedirect = `/tournaments/create?handoff=${handoff ?? ""}`;

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
            eyebrow="Tournaments"
            title={
              <>
                Create a <span className="text-accent-silver">tournament</span>
              </>
            }
            description="Host a structured R6 event for your Discord server — brackets, check-ins, and team registration handled by Parley."
          />
        }
      >
        <TournamentAuthGate
          title="Sign in to host"
          description="Authorize with Discord so we can verify you manage the host server before setup starts."
          redirectTo={loginRedirect}
        />
      </TournamentShell>
    );
  }

  return (
    <TournamentShell
      hero={
        <TournamentHero
          eyebrow="Tournaments"
          title={
            <>
              Create a <span className="text-accent-silver">tournament</span>
            </>
          }
          description="Configure your R6 event. The host server and your Discord identity are verified when you submit."
          meta={
            <div className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-accent-silver" aria-hidden />
              Host · {me.user.globalName ?? me.user.username}
            </div>
          }
        />
      }
      contentClassName="max-w-2xl"
    >
      <Reveal>
        {submitted ? (
          <GlassPanel className="p-8 md:p-10">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-silver/15">
              <CheckCircle2 className="size-6 text-accent-silver" aria-hidden />
            </div>
            <h2 className="mt-6 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              Tournament is being created
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
              Setup is running in the background. Share the tournament code with your teams once it
              appears — they can register from the event page.
            </p>
            <div className="mt-8 rounded-2xl border border-border/50 bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Next step
              </p>
              <p className="mt-1 text-sm text-foreground">
                You will receive the shareable code when provisioning completes.
              </p>
            </div>
          </GlassPanel>
        ) : (
          <GlassPanel as="section" className="p-6 md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-silver/15">
                <Trophy className="size-5 text-accent-silver" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Event setup</p>
                <p className="text-xs text-muted-foreground">Name, format, capacity, and rules</p>
              </div>
            </div>

            <form
              className="grid gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
            >
              <TournamentField label="Tournament name" htmlFor="tournament-name">
                <TournamentInput
                  id="tournament-name"
                  required
                  name="name"
                  placeholder="e.g. Friday Night 5v5"
                  autoComplete="off"
                />
              </TournamentField>

              <div className="grid gap-5 sm:grid-cols-2">
                <TournamentField label="Format" htmlFor="tournament-format">
                  <TournamentSelect
                    id="tournament-format"
                    name="format"
                    defaultValue={FORMAT_OPTIONS[0].value}
                  >
                    {FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </TournamentSelect>
                </TournamentField>

                <TournamentField
                  label="Team cap"
                  htmlFor="tournament-team-cap"
                  hint="Between 2 and 64 teams"
                >
                  <TournamentInput
                    id="tournament-team-cap"
                    required
                    type="number"
                    min={2}
                    max={64}
                    defaultValue={8}
                    name="teamCap"
                  />
                </TournamentField>
              </div>

              <TournamentField
                label="Rules and event details"
                htmlFor="tournament-rules"
                hint="Maps, check-in windows, prize info — shown to registering teams"
              >
                <TournamentTextarea
                  id="tournament-rules"
                  name="rules"
                  placeholder="Rules, map pool, check-in time, and anything teams need to know…"
                  rows={5}
                />
              </TournamentField>

              <div className="border-border/40 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Submitting verifies host server access and your Discord identity.
                </p>
                <Button
                  type="submit"
                  size="lg"
                  className="h-11 shrink-0 rounded-full bg-foreground px-6 text-background hover:bg-foreground/90"
                >
                  Create tournament
                </Button>
              </div>
            </form>
          </GlassPanel>
        )}
      </Reveal>
    </TournamentShell>
  );
}
