import { useState } from "react";
import { Trophy } from "lucide-react";
import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { LeaderboardTable } from "#/components/LeaderboardTable";
import { useLeaderboardStream } from "#/hooks/useLeaderboardStream";
import { cn } from "#/lib/utils";
import {
  formatUpdatedAt,
  LEADERBOARD_METRICS,
  METRIC_LABELS,
  type LeaderboardMetric,
} from "#/lib/leaderboard";

const statusCopy = {
  loading: "Loading",
  live: "Live",
  reconnecting: "Reconnecting",
  error: "Unavailable",
} as const;

export function LeaderboardPage() {
  const [metric, setMetric] = useState<LeaderboardMetric>("rank_points");
  const { snapshot, status } = useLeaderboardStream(metric);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />

          <div className="relative mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  Global standings
                </span>
                <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                  Rainbow Six Siege <span className="text-[#c0c5ce]">Top 100</span>
                </h1>
                <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
                  Global leaderboard across all Parley players. Updates every minute when rankings
                  change.
                </p>
              </div>

              <div className="flex items-center gap-3 self-start md:self-auto">
                <div className="inline-flex items-center gap-2 border border-border/70 bg-secondary/40 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      status === "live" ? "bg-[#c0c5ce]" : "bg-muted-foreground/50",
                    )}
                  />
                  {statusCopy[status]}
                </div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
                  Updated {formatUpdatedAt(snapshot?.updatedAt ?? 0)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-12 md:py-16">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center border border-[#c0c5ce]/50 bg-[#c0c5ce]/10">
                  <Trophy className="size-5 text-[#c0c5ce]" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Leaderboard metric</p>
                  <p className="text-xs text-muted-foreground">
                    {snapshot?.totalCount ?? 0} ranked players tracked
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Leaderboard metrics">
                {LEADERBOARD_METRICS.map((value) => {
                  const isActive = value === metric;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setMetric(value)}
                      className={cn(
                        "border px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition-colors",
                        isActive
                          ? "border-[#c0c5ce]/50 bg-secondary/40 text-foreground"
                          : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-secondary/20 hover:text-foreground",
                      )}
                    >
                      {METRIC_LABELS[value]}
                    </button>
                  );
                })}
              </div>
            </div>

            <LeaderboardTable metric={metric} entries={snapshot?.entries ?? []} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
