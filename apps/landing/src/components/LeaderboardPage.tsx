import { useState } from "react";
import { Trophy } from "lucide-react";
import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { LeaderboardTable } from "#/components/LeaderboardTable";
import { GlassPanel } from "#/components/ui/glass-panel";
import { SectionBackdrop } from "#/components/ui/section-backdrop";
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
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden py-16 md:py-24">
          <SectionBackdrop glow="center" />

          <div className="relative mx-auto w-full max-w-6xl px-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Global standings</span>
                <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                  Rainbow Six Siege <span className="text-accent-silver">Top 100</span>
                </h1>
                <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
                  Global leaderboard across all Parley players. Updates every minute when rankings
                  change.
                </p>
              </div>

              <div className="flex items-center gap-3 self-start md:self-auto">
                <div className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      status === "live" ? "bg-accent-silver" : "bg-muted-foreground/50",
                    )}
                  />
                  {statusCopy[status]}
                </div>
                <div className="text-xs text-muted-foreground/70">
                  Updated {formatUpdatedAt(snapshot?.updatedAt ?? 0)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-16 md:pb-24">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-silver/15">
                  <Trophy className="size-5 text-accent-silver" aria-hidden="true" />
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
                        "rounded-full px-4 py-2 text-xs font-medium transition-all",
                        isActive
                          ? "glass-chip text-foreground ring-1 ring-accent-silver/30"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
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