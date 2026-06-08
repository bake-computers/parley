import { cn } from "#/lib/utils";
import { formatScore, type LeaderboardEntry, type LeaderboardMetric } from "#/lib/leaderboard";

interface LeaderboardTableProps {
  metric: LeaderboardMetric;
  entries: LeaderboardEntry[];
}

function rankTone(rank: number): string {
  if (rank === 1) {
    return "text-[#c0c5ce]";
  }
  if (rank === 2) {
    return "text-foreground";
  }
  if (rank === 3) {
    return "text-foreground/80";
  }
  return "text-muted-foreground";
}

export function LeaderboardTable({ metric, entries }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="border border-border/60 bg-secondary/20 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No ranked players yet. Check back once matches are recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border/60">
      <div className="grid grid-cols-[4.5rem_1fr_8rem] border-b border-border/60 bg-secondary/30 px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:grid-cols-[5rem_1fr_9rem] md:px-6">
        <span>Rank</span>
        <span>Player</span>
        <span className="text-right">Score</span>
      </div>

      <ol>
        {entries.map((entry) => (
          <li
            key={`${entry.rank}-${entry.playerId}`}
            className={cn(
              "grid grid-cols-[4.5rem_1fr_8rem] items-center border-b border-border/40 px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-secondary/20 md:grid-cols-[5rem_1fr_9rem] md:px-6 md:py-3.5",
              entry.rank <= 3 && "bg-secondary/10",
            )}
          >
            <span className={cn("font-mono text-base tabular-nums", rankTone(entry.rank))}>
              {entry.rank}
            </span>
            <span className="truncate font-medium text-foreground">{entry.playerId}</span>
            <span className="text-right font-mono tabular-nums text-foreground">
              {formatScore(metric, entry.score)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
