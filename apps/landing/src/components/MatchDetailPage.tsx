import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { SectionBackdrop } from "#/components/ui/section-backdrop";
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
    return "Team A wins";
  }
  if (winningTeam === "team_b") {
    return "Team B wins";
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
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <Reveal>
          <section className="relative overflow-hidden py-16 md:py-24">
            <SectionBackdrop glow="center" />
            <div className="relative mx-auto w-full max-w-6xl px-6">
              <GlassPanel className="p-8 md:p-10">
                <span className="text-sm font-medium text-muted-foreground">Match report</span>
                <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                  <span className={cn(teamAWins && "text-accent-silver")}>{teamA}</span>
                  <span className="mx-3 text-muted-foreground">vs</span>
                  <span className={cn(teamBWins && "text-accent-silver")}>{teamB}</span>
                </h1>
                <p className="mt-4 text-sm text-muted-foreground">
                  Match #{match.id} · {relativeTime(match.createdAtMs)}
                </p>
                <div className="glass-chip mt-6 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-accent-silver" aria-hidden="true" />
                  {statusLabel(match.winningTeam)}
                </div>
              </GlassPanel>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="pb-16 md:pb-24">
            <div className="mx-auto w-full max-w-6xl px-6">
              <div className="grid gap-8 md:grid-cols-[1fr_320px]">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-silver/15">
                      <span className="text-sm font-semibold text-accent-silver" aria-hidden="true">
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <GlassPanel className="p-5">
                      <TeamRoster
                        label="Team A"
                        players={teamPlayers(participants, "team_a")}
                        isWinner={teamAWins}
                        mvpId={mvpId}
                      />
                    </GlassPanel>
                    <GlassPanel className="p-5">
                      <TeamRoster
                        label="Team B"
                        players={teamPlayers(participants, "team_b")}
                        isWinner={teamBWins}
                        mvpId={mvpId}
                      />
                    </GlassPanel>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-silver/15">
                      <span className="text-sm font-semibold text-accent-silver" aria-hidden="true">
                        S
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Match stats</p>
                      <p className="text-xs text-muted-foreground">Balance &amp; metadata</p>
                    </div>
                  </div>

                  <GlassPanel className="p-5">
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-medium text-muted-foreground">
                            Balance score
                          </span>
                          <span className="font-mono text-sm tabular-nums text-accent-silver">
                            {Math.max(0, 100 - match.balanceGap)}
                            <span className="text-muted-foreground">/100</span>
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                          <div
                            className="h-full origin-left rounded-full bg-accent-silver"
                            style={{ width: `${Math.max(0, 100 - match.balanceGap)}%` }}
                          />
                        </div>
                      </div>

                      <div className="space-y-3 border-t border-border/40 pt-4">
                        <StatRow label="Match ID" value={`#${match.id}`} />
                        <StatRow label="Status" value={match.status} />
                        <StatRow label="Type" value={match.matchType} />
                        <StatRow label="Balance gap" value={String(match.balanceGap)} />
                      </div>
                    </div>
                  </GlassPanel>
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
            "font-mono text-xs font-medium",
            isWinner ? "text-accent-silver" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {isWinner && (
          <span className="glass-chip px-2 py-0.5 text-[10px] font-medium text-accent-silver">
            Winner
          </span>
        )}
      </div>
      <ul className="space-y-2.5" aria-label={`${label} players`}>
        {players.map((player) => (
          <li key={player.discordUserId}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground">{player.username}</span>
                {mvpId && mvpId === player.discordUserId && (
                  <span className="glass-chip px-1.5 py-0.5 text-[9px] font-semibold text-accent-silver">
                    MVP
                  </span>
                )}
              </div>
              <span className="font-mono tabular-nums text-foreground">
                {Math.round(player.cpr)}
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full origin-left rounded-full bg-accent-silver"
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