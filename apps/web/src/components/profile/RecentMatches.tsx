import type { ProfileMatchJson, ProfileMatchPlayerJson } from "#/lib/profile/rpc";
import { cn } from "#/lib/shared/cn";

type RecentMatchesProps = {
  matches: ProfileMatchJson[];
};

function relativeTime(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(ms));
}

function formatDelta(delta: number | undefined): string | null {
  if (delta === undefined || Number.isNaN(delta)) return null;
  const rounded = Math.round(delta);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

function playerLabel(p: ProfileMatchPlayerJson): { text: string; href?: string } {
  const discord = p.discordUsername?.trim();
  const game = p.gameUsername?.trim();
  if (discord && p.profilePublic) {
    return {
      text: game ? `@${discord} (${game})` : `@${discord}`,
      href: `/@${encodeURIComponent(discord)}`,
    };
  }
  if (discord) {
    return { text: game ? `@${discord} (${game})` : `@${discord}` };
  }
  if (game) {
    return { text: game };
  }
  return { text: "Unknown" };
}

function OpponentList({ players }: { players: ProfileMatchPlayerJson[] }) {
  if (players.length === 0) {
    return <span className="text-muted-foreground">unknown opponents</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {players.map((p, i) => {
        const label = playerLabel(p);
        const node = label.href ? (
          <a
            key={p.discordUserId || `${label.text}-${i}`}
            href={label.href}
            className="text-foreground hover:text-accent-silver underline-offset-2 hover:underline"
          >
            {label.text}
          </a>
        ) : (
          <span key={p.discordUserId || `${label.text}-${i}`}>{label.text}</span>
        );
        return (
          <span key={p.discordUserId || `wrap-${i}`} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-muted-foreground">,</span> : null}
            {node}
          </span>
        );
      })}
    </span>
  );
}

export function RecentMatches({ matches }: RecentMatchesProps) {
  if (matches.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No completed Parley matches yet.</p>
    );
  }

  return (
    <ul className="divide-border/60 divide-y">
      {matches.map((match) => {
        const isWin = match.result === "win";
        const isLoss = match.result === "loss";
        const delta = formatDelta(match.ratingDelta);
        const verb = isWin ? "Won against" : isLoss ? "Lost to" : "Played";
        const kda =
          match.kills !== undefined || match.deaths !== undefined
            ? `${match.kills ?? 0}/${match.deaths ?? 0}/${match.assists ?? 0}`
            : null;

        return (
          <li key={match.publicUuid} className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm leading-relaxed">
                <span
                  className={cn(
                    "mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                    isWin && "bg-emerald-500/15 text-emerald-400",
                    isLoss && "bg-rose-500/15 text-rose-400",
                    !isWin && !isLoss && "bg-muted text-muted-foreground",
                  )}
                >
                  {isWin ? "Win" : isLoss ? "Loss" : match.result}
                </span>
                <span className="text-muted-foreground">{verb} </span>
                <OpponentList players={match.opponents} />
              </p>
              <span className="text-muted-foreground text-xs tabular-nums">
                {relativeTime(match.createdAtMs)}
              </span>
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-3 text-xs tabular-nums">
              {kda ? <span>K/D/A {kda}</span> : null}
              {delta ? (
                <span className={cn(match.ratingDelta! > 0 ? "text-emerald-400" : "text-rose-400")}>
                  Rank {delta}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
