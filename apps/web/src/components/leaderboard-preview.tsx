import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import useLeaderboardWS from "#/hooks/use-leaderboard-ws";

type LeaderboardEntry = {
  playerId: number;
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  discordUserId?: string | null;
};

const PLATFORM_STYLES: Record<string, string> = {
  PC: "bg-[rgba(59,130,246,0.15)] text-[#7db4fc]",
  Xbox: "bg-[rgba(16,185,129,0.15)] text-[#6ee7b7]",
  PlayStation: "bg-[rgba(168,85,247,0.15)] text-[#c4b5fd]",
};

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-none px-1.5 py-0.5 font-mono text-[0.65rem] font-medium tracking-wide uppercase ${PLATFORM_STYLES[platform] ?? "bg-secondary text-secondary-foreground"}`}
    >
      {platform}
    </span>
  );
}

function useFlipAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const newPositions = new Map<string, DOMRect>();
    containerRef.current?.querySelectorAll("[data-flip-id]").forEach((el) => {
      const id = el.getAttribute("data-flip-id");
      if (id) newPositions.set(id, el.getBoundingClientRect());
    });

    newPositions.forEach((newRect, id) => {
      const oldRect = positionsRef.current.get(id);
      if (oldRect) {
        const deltaY = oldRect.top - newRect.top;
        if (Math.abs(deltaY) > 0.5) {
          const el = containerRef.current?.querySelector(`[data-flip-id="${id}"]`);
          if (el instanceof HTMLElement) {
            el.style.transition = "none";
            el.style.transform = `translateY(${deltaY}px)`;
            void el.offsetHeight;
            requestAnimationFrame(() => {
              el.style.transition = "transform 400ms cubic-bezier(0.16, 1, 0.3, 1)";
              el.style.transform = "";
            });
          }
        }
      }
    });

    positionsRef.current = newPositions;
  });

  return containerRef;
}

export function LeaderboardPreview() {
  const { entries: wsEntries, isConnected } = useLeaderboardWS([1, 10]);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useFlipAnimation();
  const prevRanksRef = useRef<Map<number, number>>(new Map());
  const [changedElo, setChangedElo] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/leaderboard?page=1&pageSize=10")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.entries) ? (data.entries as LeaderboardEntry[]) : [];
        setEntries(list);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (wsEntries.length > 0) {
      setEntries((prev) => {
        const prevMap = new Map(prev.map((e, i) => [e.playerId, { entry: e, rank: i + 1 }]));
        const newMap = new Map(wsEntries.map((e, i) => [e.playerId, { entry: e, rank: i + 1 }]));

        const eloChanges = new Set<number>();
        newMap.forEach(({ entry }, id) => {
          const prevData = prevMap.get(id);
          if (prevData && prevData.entry.internalElo !== entry.internalElo) {
            eloChanges.add(id);
          }
        });
        if (eloChanges.size > 0) {
          setChangedElo(eloChanges);
          setTimeout(() => setChangedElo(new Set()), 800);
        }

        prevRanksRef.current = new Map(prev.map((e, i) => [e.playerId, i + 1]));

        return wsEntries;
      });
    }
  }, [wsEntries]);

  const displayEntries = entries.length > 0 ? entries : [];

  return (
    <section className="lp-section">
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="lp-label mb-2">Live Rankings</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Top <span className="gradient-text">Players</span>
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-amber-500"}`}
            >
              {isConnected && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              )}
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              {isConnected ? "LIVE" : "CONNECTING"}
            </span>
          </div>
          <a
            href="/leaderboard"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-blue hover:text-accent-cyan transition-colors duration-fast"
          >
            View Full Leaderboard
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div ref={containerRef} className="flex flex-col gap-1">
        <div className="grid grid-cols-[3rem_1fr_6rem_4rem] gap-3 px-4 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground border-b border-border/30">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">ELO</span>
          <span className="text-right">Platform</span>
        </div>

        {isLoading && displayEntries.length === 0 && (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[3rem_1fr_6rem_4rem] gap-3 px-4 py-3 items-center depth-panel shimmer"
              >
                <div className="h-4 w-6 bg-white/5 rounded" />
                <div className="h-4 w-32 bg-white/5 rounded" />
                <div className="h-4 w-16 bg-white/5 rounded justify-self-end" />
                <div className="h-4 w-12 bg-white/5 rounded justify-self-end" />
              </div>
            ))}
          </div>
        )}

        {displayEntries.map((entry, index) => {
          const rank = index + 1;
          const prevRank = prevRanksRef.current.get(entry.playerId);
          const rankChanged = prevRank !== undefined && prevRank !== rank;
          const eloChanged = changedElo.has(entry.playerId);

          return (
            <div
              key={entry.playerId}
              data-flip-id={entry.playerId}
              className={`grid grid-cols-[3rem_1fr_6rem_4rem] gap-3 px-4 py-3 items-center depth-panel transition-all duration-normal ${
                eloChanged ? "bg-[rgba(59,130,246,0.08)]" : ""
              }`}
              style={{
                borderLeft:
                  rank === 1
                    ? "2px solid #fbbf24"
                    : rank === 2
                      ? "2px solid #9ca3af"
                      : rank === 3
                        ? "2px solid #b45309"
                        : "2px solid transparent",
              }}
            >
              <div className="flex items-center gap-1">
                <span
                  className={`font-mono text-sm tabular-nums font-bold ${
                    rank === 1
                      ? "text-amber-400"
                      : rank === 2
                        ? "text-gray-300"
                        : rank === 3
                          ? "text-amber-600"
                          : "text-muted-foreground"
                  }`}
                >
                  {rank}
                </span>
                {rankChanged && prevRank !== undefined && (
                  <span
                    className={`text-[0.65rem] font-mono ${prevRank > rank ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {prevRank > rank ? "↑" : "↓"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-sm font-medium text-foreground">
                  {entry.username}
                </span>
              </div>

              <span
                className={`font-mono text-sm tabular-nums text-right ${
                  eloChanged ? "text-accent-blue" : "text-foreground"
                }`}
              >
                {entry.internalElo.toLocaleString()}
              </span>

              <div className="text-right">
                <PlatformBadge platform={entry.platform} />
              </div>
            </div>
          );
        })}

        {!isLoading && displayEntries.length === 0 && (
          <div className="depth-panel px-4 py-8 text-center text-muted-foreground text-sm">
            No leaderboard data available.
          </div>
        )}
      </div>
    </section>
  );
}
