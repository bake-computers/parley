const TEAM_ALPHA = {
  name: "Team Alpha",
  avgElo: 1247,
  players: [
    { username: "AshMain", platform: "PC" as const, elo: 1384, rank: "Gold II" },
    { username: "VigilPlayer", platform: "PC" as const, elo: 1295, rank: "Silver I" },
    { username: "PulseOps", platform: "Xbox" as const, elo: 1210, rank: "Gold III" },
    { username: "EchoStrike", platform: "PlayStation" as const, elo: 1152, rank: "Silver III" },
    { username: "SledgePhD", platform: "PC" as const, elo: 1194, rank: "Gold IV" },
  ],
};

const TEAM_BRAVO = {
  name: "Team Bravo",
  avgElo: 1229,
  players: [
    { username: "JägerBomb", platform: "PC" as const, elo: 1402, rank: "Gold I" },
    { username: "CaveiraX", platform: "Xbox" as const, elo: 1267, rank: "Silver I" },
    { username: "Thermite4Days", platform: "PC" as const, elo: 1198, rank: "Gold IV" },
    { username: "ValkyrieEye", platform: "PlayStation" as const, elo: 1134, rank: "Bronze I" },
    { username: "RookSolid", platform: "PC" as const, elo: 1144, rank: "Silver II" },
  ],
};

const PLATFORM_STYLES: Record<string, string> = {
  PC: "bg-white/10 text-white/80",
  Xbox: "bg-white/10 text-white/80",
  PlayStation: "bg-white/10 text-white/80",
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

function PlayerRow({
  player,
}: {
  player: { username: string; platform: string; elo: number; rank: string };
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">{player.username}</span>
        <PlatformBadge platform={player.platform} />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-sm tabular-nums text-foreground">
          {player.elo.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">{player.rank}</span>
      </div>
    </div>
  );
}

function TeamColumn({ team }: { team: typeof TEAM_ALPHA }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
        <h3 className="text-sm font-bold tracking-wide uppercase text-foreground">{team.name}</h3>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          Avg {team.avgElo.toLocaleString()} ELO
        </span>
      </div>
      <div className="flex flex-col">
        {team.players.map((player) => (
          <PlayerRow key={player.username} player={player} />
        ))}
      </div>
    </div>
  );
}

export function DiscordMock() {
  return (
    <div className="lp-card relative overflow-hidden p-0">
      <div className="absolute left-0 top-0 h-full w-1 bg-muted-foreground" />

      <div className="flex flex-col gap-4 p-5 pl-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
            <span className="text-sm font-bold tracking-wide uppercase text-foreground">
              Team Balance
            </span>
          </div>
          <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
            Today at 8:42 PM
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <TeamColumn team={TEAM_ALPHA} />
          <TeamColumn team={TEAM_BRAVO} />
        </div>

        <div className="flex items-center justify-center gap-2 border-t border-border pt-3">
          <span className="font-mono text-sm tabular-nums text-foreground">18</span>
          <span className="text-xs text-muted-foreground">ELO gap</span>
          <span className="rounded-none bg-white/10 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wider text-white/80">
            Well Balanced
          </span>
        </div>

        <div className="flex items-center gap-1.5 border-t border-border pt-3">
          <div className="h-1.5 w-1.5 rounded-full bg-white/60" />
          <span className="text-[0.7rem] text-muted-foreground">Match recorded</span>
        </div>
      </div>
    </div>
  );
}
