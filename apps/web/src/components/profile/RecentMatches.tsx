import type { ProfileMatchJson, ProfileMatchPlayerJson } from "#/lib/profile/rpc";
import { cn } from "#/lib/shared/cn";

type RecentMatchesProps = {
  matches: ProfileMatchJson[];
};

function relativeTime(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(ms));
}

function formatDelta(delta: number | undefined): string | null {
  if (delta === undefined || Number.isNaN(delta)) {
    return null;
  }
  const rounded = Math.round(delta);
  if (rounded > 0) {
    return `+${rounded}`;
  }
  return String(rounded);
}

function playerLabel(p: ProfileMatchPlayerJson): { text: string; href?: string } {
  if (!p.profilePublic) {
    return { text: "Private player" };
  }

  const discord = p.discordUsername?.trim();
  const game = p.gameUsername?.trim();
  if (discord) {
    return {
      text: game ? `@${discord} (${game})` : `@${discord}`,
      href: `/@${encodeURIComponent(discord)}`,
    };
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
        const gained = delta !== null && Number(delta) > 0;
        const verb = isWin ? "Won against" : isLoss ? "Lost to" : "Played";
        const kda =
          match.kills !== undefined || match.deaths !== undefined
            ? `${match.kills ?? 0}/${match.deaths ?? 0}/${match.assists ?? 0}`
            : null;

        return (
          <li
            key={match.publicUuid}
            className="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-5"
          >
            <span
              className={cn(
                "inline-flex w-fit shrink-0 items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wider sm:w-16",
                isWin && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                isLoss && "border-rose-500/30 bg-rose-500/10 text-rose-400",
                !isWin && !isLoss && "border-border bg-muted text-muted-foreground",
              )}
            >
              {isWin ? "Win" : isLoss ? "Loss" : match.result}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed">
                <span className="text-muted-foreground">{verb} </span>
                <OpponentList players={match.opponents} />
              </p>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs tabular-nums">
                {kda ? (
                  <span>
                    <span className="text-foreground/45">K/D/A</span> {kda}
                  </span>
                ) : null}
                {delta ? (
                  <span className={cn(gained ? "text-emerald-400" : "text-rose-400")}>
                    <span className="text-foreground/45">Rank</span> {delta}
                  </span>
                ) : null}
              </div>
            </div>

            <span className="text-muted-foreground shrink-0 text-xs tabular-nums sm:text-right">
              {relativeTime(match.createdAtMs)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
