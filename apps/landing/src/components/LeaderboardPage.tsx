import { useState } from "react";
import { Trophy } from "lucide-react";
import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { LeaderboardTable } from "#/components/LeaderboardTable";
import { SectionBackdrop } from "#/components/ui/section-backdrop";
import { useLeaderboardStream } from "#/hooks/useLeaderboardStream";
import { formatUpdatedAt } from "#/lib/shared/format-relative-time";
import { LEADERBOARD_METRICS, type LeaderboardMetric } from "#/lib/leaderboard";
import { useMessages } from "#/lib/content/messages/use-messages";
import { cn } from "#/lib/shared/cn";

export function LeaderboardPage() {
  const [metric, setMetric] = useState<LeaderboardMetric>("rank_points");
  const { snapshot, status } = useLeaderboardStream(metric);
  const m = useMessages();
  const lb = m.leaderboard;

  const statusLabel =
    status === "loading"
      ? lb.statusLoading
      : status === "live"
        ? lb.statusLive
        : status === "reconnecting"
          ? lb.statusReconnecting
          : lb.statusError;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden py-16 md:py-24">
          <SectionBackdrop glow="center" />

          <div className="relative mx-auto w-full max-w-6xl px-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="text-sm font-medium text-muted-foreground">{lb.eyebrow}</span>
                <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                  {lb.titleBefore}
                  <span className="text-accent-silver">{lb.titleHighlight}</span>
                </h1>
                <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
                  {lb.subtitle}
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
                  {statusLabel}
                </div>
                <div className="text-xs text-muted-foreground/70">
                  {formatUpdatedAt(snapshot?.updatedAt ?? 0, lb.updatedPrefix)}
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
                  <p className="text-sm font-medium text-foreground">{lb.metricHeading}</p>
                  <p className="text-xs text-muted-foreground">
                    {snapshot?.totalCount ?? 0} {lb.playersTracked}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2" role="tablist" aria-label={lb.metricsAria}>
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
                      {lb.metrics[value]}
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