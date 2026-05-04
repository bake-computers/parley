import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  MinusSignIcon,
  Loading01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Skeleton } from "#/components/ui/skeleton";
import useLeaderboardWS from "#/hooks/use-leaderboard-ws";
import { cn } from "#/lib/utils";
import { apiUrl } from "#/lib/api";

type Platform = "all" | "pc" | "xbox" | "playstation";

interface ApiEntry {
  playerId: number;
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  discordUserId: string | null;
}

interface ApiPage {
  entries: ApiEntry[];
  totalPlayers: number;
  page: number;
  pageSize: number;
}

interface MergedEntry {
  playerId: number;
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  discordUserId: string | null;
  eloTrend: "up" | "down" | "same";
}

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pc", label: "PC" },
  { value: "xbox", label: "Xbox" },
  { value: "playstation", label: "PlayStation" },
];

const PLATFORM_COLORS: Record<string, string> = {
  pc: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  xbox: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  playstation: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

function getPlatformColor(platform: string): string {
  return (
    PLATFORM_COLORS[platform.toLowerCase()] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30"
  );
}

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardRoute,
});

function LeaderboardRoute() {
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [platformFilter, setPlatformFilter] = useState<Platform>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [apiData, setApiData] = useState<ApiPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousElos = useRef<Map<number, number>>(new Map());

  const slotRange: [number, number] = useMemo(() => {
    const start = (page - 1) * pageSize + 1;
    const end = page * pageSize;
    return [start, end];
  }, [page]);

  const { entries: wsEntries, isConnected, lastUpdated } = useLeaderboardWS(slotRange);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/leaderboard?page=${page}&pageSize=${pageSize}`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ApiPage;
        if (!cancelled) {
          setApiData(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load leaderboard");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const entries = useMemo(() => {
    const apiMap = new Map<number, ApiEntry>();
    apiData?.entries.forEach((entry) => {
      apiMap.set(entry.playerId, entry);
    });

    const wsMap = new Map<number, MergedEntry>();
    wsEntries.forEach((wsEntry, index) => {
      const rank = index + 1;
      if (rank < slotRange[0] || rank > slotRange[1]) return;

      const apiEntry = apiMap.get(wsEntry.playerId);
      const prevElo = previousElos.current.get(wsEntry.playerId) ?? wsEntry.internalElo;
      const trend: MergedEntry["eloTrend"] =
        wsEntry.internalElo > prevElo ? "up" : wsEntry.internalElo < prevElo ? "down" : "same";

      wsMap.set(wsEntry.playerId, {
        playerId: wsEntry.playerId,
        username: wsEntry.username,
        platform: wsEntry.platform,
        internalElo: wsEntry.internalElo,
        internalMatches: wsEntry.internalMatches,
        internalWins: apiEntry?.internalWins ?? 0,
        internalLosses: apiEntry?.internalLosses ?? 0,
        discordUserId: wsEntry.discordUserId ?? null,
        eloTrend: trend,
      });

      previousElos.current.set(wsEntry.playerId, wsEntry.internalElo);
    });

    if (wsMap.size > 0) {
      return Array.from(wsMap.values());
    }

    return (
      apiData?.entries.map((entry) => ({
        ...entry,
        eloTrend: "same" as const,
      })) ?? []
    );
  }, [apiData, wsEntries, slotRange]);

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (platformFilter !== "all") {
      result = result.filter((e) => e.platform.toLowerCase() === platformFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) => e.username.toLowerCase().includes(q));
    }

    return result;
  }, [entries, platformFilter, searchQuery]);

  const totalPages = apiData ? Math.ceil(apiData.totalPlayers / pageSize) : 1;

  return (
    <main className="min-h-screen pb-20 pt-14 md:pt-16">
      <div className="lp-container pt-8 pb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Global Leaderboard
            </h1>
            <p className="text-muted-foreground mt-2">Real-time R6 Siege Rankings</p>
          </div>

          <div className="flex items-center gap-2">
            <div className={cn("relative flex h-3 w-3", isConnected && "animate-pulse")}>
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75",
                  isConnected ? "bg-green-500" : "bg-yellow-500",
                )}
              />
              <span
                className={cn(
                  "relative inline-flex rounded-full h-3 w-3",
                  isConnected ? "bg-green-500" : "bg-yellow-500",
                )}
              />
            </div>
            <Badge variant={isConnected ? "default" : "secondary"}>
              {isConnected ? "LIVE" : "Connecting..."}
            </Badge>
            {lastUpdated ? (
              <span className="text-xs text-muted-foreground">
                Updated {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <Button
                key={p.value}
                variant={platformFilter === p.value ? "default" : "outline"}
                size="sm"
                onClick={() => setPlatformFilter(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/50"
            />
          </div>
        </div>
      </div>

      <div className="lp-container">
        {isLoading && !apiData ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center text-destructive">{error}</div>
        ) : (
          <>
            <div className="hidden md:block overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Rank</th>
                    <th className="px-4 py-3 font-medium">Player</th>
                    <th className="px-4 py-3 font-medium">Platform</th>
                    <th className="px-4 py-3 font-medium">ELO</th>
                    <th className="px-4 py-3 font-medium">Matches</th>
                    <th className="px-4 py-3 font-medium">Wins</th>
                    <th className="px-4 py-3 font-medium">Losses</th>
                    <th className="px-4 py-3 font-medium">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry, idx) => {
                    const rank = (page - 1) * pageSize + idx + 1;
                    const winRate =
                      entry.internalMatches > 0
                        ? Math.round((entry.internalWins / entry.internalMatches) * 100)
                        : 0;

                    return (
                      <tr
                        key={entry.playerId}
                        className={cn(
                          "border-b border-border/50 transition-colors duration-200",
                          "hover:bg-muted/50",
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-muted-foreground">#{rank}</td>
                        <td className="px-4 py-3 font-medium">{entry.username}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={cn("text-xs capitalize", getPlatformColor(entry.platform))}
                          >
                            {entry.platform}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-medium">{entry.internalElo}</span>
                            {entry.eloTrend === "up" && (
                              <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {entry.eloTrend === "down" && (
                              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {entry.eloTrend === "same" && (
                              <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {entry.internalMatches}
                        </td>
                        <td className="px-4 py-3 font-mono text-foreground">{entry.internalWins}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{entry.internalLosses}</td>
                        <td className="px-4 py-3 font-mono">{winRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden flex flex-col gap-3">
              {filteredEntries.map((entry, idx) => {
                const rank = (page - 1) * pageSize + idx + 1;
                const winRate =
                  entry.internalMatches > 0
                    ? Math.round((entry.internalWins / entry.internalMatches) * 100)
                    : 0;

                return (
                  <div
                    key={entry.playerId}
                    className="rounded-lg border border-border bg-card p-4 transition-colors duration-200 hover:bg-accent"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-muted-foreground">#{rank}</span>
                        <span className="font-medium">{entry.username}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("text-xs capitalize", getPlatformColor(entry.platform))}
                      >
                        {entry.platform}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                          ELO
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono font-medium">{entry.internalElo}</span>
                          {entry.eloTrend === "up" && (
                            <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {entry.eloTrend === "down" && (
                            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {entry.eloTrend === "same" && (
                            <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                          Matches
                        </p>
                        <p className="font-mono mt-0.5">{entry.internalMatches}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                          Wins
                        </p>
                        <p className="font-mono text-foreground mt-0.5">{entry.internalWins}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                          Losses
                        </p>
                        <p className="font-mono text-red-400 mt-0.5">{entry.internalLosses}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                          Win Rate
                        </p>
                        <p className="font-mono mt-0.5">{winRate}%</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredEntries.length === 0 && !isLoading && (
              <div className="py-20 text-center text-muted-foreground">
                No players found matching your filters.
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
