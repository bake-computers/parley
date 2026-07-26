import { createFileRoute } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { useState, type FormEvent } from "react";
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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            description="Host a structured R6 event for your Discord server: brackets, check-ins, and team registration handled by Parley."
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

          <form className="grid gap-5" onSubmit={submitTournament}>
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
              hint="Maps, check-in windows, prize info (shown to registering teams)"
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
                disabled={creating || !handoff}
                className="h-11 shrink-0 rounded-full bg-foreground px-6 text-background hover:bg-foreground/90"
              >
                {creating ? "Creating tournament…" : "Create tournament"}
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {!handoff ? (
              <p className="text-sm text-destructive">
                Start tournament creation from the <code>/tournament create</code> command in your
                host server.
              </p>
            ) : null}
          </form>
        </GlassPanel>
      </Reveal>
    </TournamentShell>
  );

  async function submitTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!handoff || creating) return;
    const form = new FormData(event.currentTarget);
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments/create", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handoff,
          name: form.get("name"),
          format: form.get("format"),
          teamCap: Number(form.get("teamCap")),
          rulesText: form.get("rules"),
        }),
      });
      const data = (await res.json()) as { tournament?: { publicCode?: string }; error?: string };
      if (!res.ok || !data.tournament?.publicCode) {
        throw new Error(data.error ?? "Tournament creation failed");
      }
      window.location.assign(`/tournaments/${encodeURIComponent(data.tournament.publicCode)}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Tournament creation failed. Please try again.",
      );
      setCreating(false);
    }
  }
}
