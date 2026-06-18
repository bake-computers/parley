import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { Reveal } from "#/components/ui/reveal";
import { cn } from "#/lib/utils";
import type { MatchData, MatchParticipantData } from "#/lib/match-cache";

function relativeTime(epochMs: number): string {
  const seconds = Math.floor((Date.now() - epochMs) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function teamName(participants: MatchParticipantData[], team: string): string {
  return (
    participants
      .filter((p) => p.team === team && p.username !== "")
      .map((p) => p.username)
      .join(", ") || "\u2014"
  );
}

function teamPlayers(participants: MatchParticipantData[], team: string) {
  return participants.filter((p) => p.team === team);
}

function statusLabel(winningTeam: string): string {
  if (winningTeam === "team_a") {
    return "Team A Wins";
  }
  if (winningTeam === "team_b") {
    return "Team B Wins";
  }
  return "Draw";
}

export function MatchDetailPage({ match }: { match: MatchData }) {
  const participants = match.participants ?? [];
  const teamA = teamName(participants, "team_a");
  const teamB = teamName(participants, "team_b");
  const teamAWins = match.winningTeam === "team_a";
  const teamBWins = match.winningTeam === "team_b";
  const mvpId = match.mvpUserId;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Reveal>
          <section className="border-b border-border/60">
            <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
              <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Match report
              </span>
              <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                <span className={cn(teamAWins && "text-[#c0c5ce]")}>{teamA}</span>
                <span className="mx-3 text-muted-foreground">vs</span>
                <span className={cn(teamBWins && "text-[#c0c5ce]")}>{teamB}</span>
              </h1>
              <p className="mt-4 text-sm text-muted-foreground">
                Match #{match.id} · {relativeTime(match.createdAtMs)}
              </p>
              <div className="mt-6 inline-flex items-center gap-2 border border-border/60 bg-secondary/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-[#c0c5ce]" aria-hidden="true" />
                {statusLabel(match.winningTeam)}
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section>
            <div className="mx-auto w-full max-w-6xl px-6 py-12 md:py-16">
              <div className="grid gap-8 md:grid-cols-[1fr_320px]">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center border border-[#c0c5ce]/50 bg-[#c0c5ce]/10">
                      <span className="text-sm font-semibold text-[#c0c5ce]" aria-hidden="true">
                        R
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Team rosters</p>
                      <p className="text-xs text-muted-foreground">
                        {participants.length} players
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-px bg-border/60 md:grid-cols-2">
                    <div className="bg-background p-5">
                      <TeamRoster
                        label="Team A"
                        players={teamPlayers(participants, "team_a")}
                        isWinner={teamAWins}
                        mvpId={mvpId}
                      />
                    </div>
                    <div className="bg-background p-5">
                      <TeamRoster
                        label="Team B"
                        players={teamPlayers(participants, "team_b")}
                        isWinner={teamBWins}
                        mvpId={mvpId}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center border border-[#c0c5ce]/50 bg-[#c0c5ce]/10">
                      <span className="text-sm font-semibold text-[#c0c5ce]" aria-hidden="true">
                        S
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Match stats</p>
                      <p className="text-xs text-muted-foreground">Balance &amp; metadata</p>
                    </div>
                  </div>

                  <div className="border border-border/60 bg-secondary/20 p-5">
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono uppercase tracking-wider text-muted-foreground">
                            Balance score
                          </span>
                          <span className="font-mono text-sm tabular-nums text-[#c0c5ce]">
                            {Math.max(0, 100 - match.balanceGap)}
                            <span className="text-muted-foreground">/100</span>
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden bg-border/60">
                          <div
                            className="h-full origin-left bg-[#c0c5ce]"
                            style={{ width: `${Math.max(0, 100 - match.balanceGap)}%` }}
                          />
                        </div>
                      </div>

                      <div className="space-y-3 border-t border-border/60 pt-4">
                        <StatRow label="Match ID" value={`#${match.id}`} />
                        <StatRow label="Status" value={match.status} />
                        <StatRow label="Type" value={match.matchType} />
                        <StatRow label="Balance gap" value={String(match.balanceGap)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </Reveal>
      </main>
      <SiteFooter />
    </div>
  );
}

function TeamRoster({
  label,
  players,
  isWinner,
  mvpId,
}: {
  label: string;
  players: MatchParticipantData[];
  isWinner: boolean;
  mvpId?: string;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span
          className={cn(
            "font-mono text-[11px] uppercase tracking-widest",
            isWinner ? "text-[#c0c5ce]" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {isWinner && (
          <span className="text-[10px] uppercase tracking-widest text-[#c0c5ce]">Winner</span>
        )}
      </div>
      <ul className="space-y-2.5" aria-label={`${label} players`}>
        {players.map((player) => (
          <li key={player.discordUserId}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground">{player.username}</span>
                {mvpId && mvpId === player.discordUserId && (
                  <span className="border border-[#c0c5ce]/50 bg-[#c0c5ce]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#c0c5ce]">
                    MVP
                  </span>
                )}
              </div>
              <span className="font-mono tabular-nums text-foreground">
                {Math.round(player.cpr)}
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden bg-border/60">
              <div
                className="h-full origin-left bg-[#c0c5ce]"
                style={{ width: `${Math.min(100, (player.cpr / 3000) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}
