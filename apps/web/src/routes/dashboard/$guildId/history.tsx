import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight, Swords } from "lucide-react";
import { cn } from "#/lib/utils";

interface Match {
  id: number;
  status: string;
  matchType: string;
  teamASeedTotal: number;
  teamBSeedTotal: number;
  winningTeam: string | null;
  createdAt: number;
  updatedAt: number;
}

interface MatchHistoryResponse {
  matches: Match[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const Route = createFileRoute("/dashboard/$guildId/history")({
  component: MatchHistory,
});

function MatchHistory() {
  const { guildId } = Route.useParams();
  const [data, setData] = useState<MatchHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function fetchHistory() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/dashboard/guilds/${guildId}/history?page=${page}&pageSize=20`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = (await res.json()) as MatchHistoryResponse;
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load match history");
      } finally {
        setIsLoading(false);
      }
    }
    fetchHistory();
  }, [guildId, page]);

  function getStatusBadge(status: string) {
    switch (status.toLowerCase()) {
      case "completed":
      case "finished":
        return <Badge variant="default">Completed</Badge>;
      case "active":
      case "ongoing":
        return <Badge variant="default">Active</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent-blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Match History</h1>
        <p className="text-muted-foreground mt-1">View recorded matches for this server.</p>
      </div>

      {data?.matches.length === 0 ? (
        <div className="depth-panel rounded-lg p-8 text-center">
          <Swords className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No Matches Yet</h2>
          <p className="text-muted-foreground mt-2">
            Matches will appear here once they are recorded on this server.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-depth-2 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Team A ELO</th>
                  <th className="px-4 py-3 font-medium">Team B ELO</th>
                  <th className="px-4 py-3 font-medium">Winner</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data?.matches.map((match) => (
                  <tr
                    key={match.id}
                    className={cn("border-b border-white/5 transition-colors hover:bg-white/5")}
                  >
                    <td className="px-4 py-3 font-mono text-muted-foreground">#{match.id}</td>
                    <td className="px-4 py-3 capitalize">{match.matchType}</td>
                    <td className="px-4 py-3">{getStatusBadge(match.status)}</td>
                    <td className="px-4 py-3 font-mono">{Math.round(match.teamASeedTotal)}</td>
                    <td className="px-4 py-3 font-mono">{Math.round(match.teamBSeedTotal)}</td>
                    <td className="px-4 py-3">
                      {match.winningTeam ? (
                        <span
                          className={match.winningTeam === "A" ? "text-green-400" : "text-blue-400"}
                        >
                          Team {match.winningTeam}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(match.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
