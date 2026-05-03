import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getGuildPlayers } from "#/lib/server/guild-settings";
import { AuthGuard } from "#/components/auth-guard";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

const loadGuildPlayers = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return getGuildPlayers(getRequestHeaders(), data.guildId);
  });

export const Route = createFileRoute("/guild/$guildId/players")({
  loader: ({ params }) => loadGuildPlayers({ data: { guildId: params.guildId } }),
  component: GuildPlayersRoute,
});

type SortKey = "internalElo" | "internalMatches" | "internalWins";
type SortDirection = "asc" | "desc";

function platformColor(platform: string): string {
  switch (platform.toLowerCase()) {
    case "pc":
      return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "xbox":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    case "playstation":
      return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
    default:
      return "bg-white/10 text-white/70 border-white/10";
  }
}

function formatWinRate(wins: number, matches: number): string {
  if (matches === 0) return "0.0%";
  return `${((wins / matches) * 100).toFixed(1)}%`;
}

function GuildPlayersRoute() {
  const { guildId } = Route.useParams();
  const data = Route.useLoaderData();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("internalElo");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((p) => p.username.toLowerCase().includes(q));
    }
    rows = [...rows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
    return rows;
  }, [data, searchQuery, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const paged = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
    setPage(1);
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <span className="ml-1 text-white/30">↕</span>;
    return <span className="ml-1 text-white/70">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <AuthGuard guildId={guildId}>
      <div className="hq-shell">
        <h1 className="hq-title">Players</h1>
        <p className="hq-subtitle">Guild player roster and statistics.</p>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by username..."
              className="flex h-9 w-full rounded-md border border-white/12 bg-white/4 py-2 pr-3 pl-9 text-sm text-white shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-white/30 focus-visible:ring-[3px] focus-visible:ring-white/30 placeholder:text-white/40"
            />
          </div>
          <div className="text-sm text-white/60">
            {filtered.length} player{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="mt-4 table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort("internalElo")}>
                  ELO <SortIcon column="internalElo" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort("internalMatches")}>
                  Matches <SortIcon column="internalMatches" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort("internalWins")}>
                  Wins <SortIcon column="internalWins" />
                </TableHead>
                <TableHead>Losses</TableHead>
                <TableHead>Win Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((player, index) => (
                <TableRow key={player.id}>
                  <TableCell className="font-mono text-white/60">
                    #{(clampedPage - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{player.username}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={platformColor(player.platform)}>
                      {player.platform}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{Math.round(player.internalElo)}</TableCell>
                  <TableCell>{player.internalMatches}</TableCell>
                  <TableCell>{player.internalWins}</TableCell>
                  <TableCell>{player.internalLosses}</TableCell>
                  <TableCell>
                    {formatWinRate(player.internalWins, player.internalMatches)}
                  </TableCell>
                </TableRow>
              ))}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-white/50">
                    No players found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              className="hq-button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage <= 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-white/60">
              Page {clampedPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="hq-button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage >= totalPages}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
