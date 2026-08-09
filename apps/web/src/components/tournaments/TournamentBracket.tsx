import { Trophy } from "lucide-react";
import type { BracketMatchJson } from "#/lib/tournament/rpc";
import { cn } from "#/lib/shared/cn";

export type BracketTeam = { id: number; teamName: string; seedNumber?: number };

export type BracketRound = {
  roundNumber: number;
  matches: BracketMatchJson[];
};

export type BracketGroup = {
  bracket: string;
  rounds: BracketRound[];
};

/** Smallest power of two >= n, with a floor of 2. Mirrors the Go bracket. */
export function nextPowerOfTwo(n: number): number {
  if (n <= 1) {
    return 2;
  }
  let size = 1;
  while (size < n) {
    size *= 2;
  }
  return size;
}

/**
 * Synthetic pre-start bracket: empty team slots, pending matches, negative
 * ids so they never collide with persisted matches. Mirrors the Go topology
 * at display level — winners rounds for single elim; winners + simplified
 * losers + grand final for double elim.
 */
export function buildPlaceholderBracket({
  teamCount,
  format,
}: {
  teamCount: number;
  format: string;
}): BracketMatchJson[] {
  const bracketSize = nextPowerOfTwo(teamCount);
  const matches: BracketMatchJson[] = [];
  let id = -1;
  const push = (bracket: string, roundNumber: number, matchNumber: number) => {
    matches.push({ id: id--, bracket, roundNumber, matchNumber, status: "pending" });
  };

  // Winners bracket: full single-elimination tree.
  let matchesInRound = bracketSize / 2;
  for (let round = 1; matchesInRound >= 1; round++) {
    for (let m = 0; m < matchesInRound; m++) {
      push("winners", round, m + 1);
    }
    matchesInRound /= 2;
  }

  if (format.includes("double")) {
    // Losers round 1 feeds the round-2 feeder (bracketSize/4, floored at 1).
    const losersR1 = Math.max(1, bracketSize / 4);
    for (let m = 0; m < losersR1; m++) {
      push("losers", 1, m + 1);
    }
    push("losers", 2, 1);
    push("grand_final", 1, 1);
  }

  return matches;
}

const BRACKET_LABELS: Record<string, string> = {
  winners: "Winners bracket",
  losers: "Losers bracket",
  grand_final: "Grand final",
};

const BRACKET_ORDER = ["winners", "losers", "grand_final"];

function bracketRank(bracket: string): number {
  const index = BRACKET_ORDER.indexOf(bracket);
  return index === -1 ? BRACKET_ORDER.length : index;
}

export function bracketLabel(bracket: string): string {
  return BRACKET_LABELS[bracket] ?? bracket;
}

/** Groups matches into bracket sections (winners/losers/grand final) with rounds sorted for display. */
export function groupBracket(matches: BracketMatchJson[]): BracketGroup[] {
  const byBracket = new Map<string, Map<number, BracketMatchJson[]>>();
  for (const match of matches) {
    const rounds = byBracket.get(match.bracket) ?? new Map<number, BracketMatchJson[]>();
    const list = rounds.get(match.roundNumber) ?? [];
    list.push(match);
    rounds.set(match.roundNumber, list);
    byBracket.set(match.bracket, rounds);
  }
  return [...byBracket.entries()]
    .map(([bracket, rounds]) => ({
      bracket,
      rounds: [...rounds.entries()]
        .sort(([a], [b]) => a - b)
        .map(([roundNumber, roundMatches]) => ({
          roundNumber,
          matches: [...roundMatches].sort((a, b) => a.matchNumber - b.matchNumber),
        })),
    }))
    .sort((a, b) => bracketRank(a.bracket) - bracketRank(b.bracket));
}

export function TournamentBracket({
  matches,
  teams,
}: {
  matches: BracketMatchJson[];
  teams: BracketTeam[];
}) {
  const groups = groupBracket(matches);
  if (groups.length === 0) {return null;}
  const teamNames = new Map(teams.map((team) => [team.id, team.teamName]));
  const seeds = new Map(
    teams
      .filter((team): team is BracketTeam & { seedNumber: number } => (team.seedNumber ?? 0) > 0)
      .map((team) => [team.id, team.seedNumber]),
  );

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.bracket}>
          <p className="text-muted-foreground mb-4 text-xs font-medium tracking-wide uppercase">
            {bracketLabel(group.bracket)}
          </p>
          <div className="flex gap-6 overflow-x-auto pb-2">
            {group.rounds.map((round) => (
              <div key={round.roundNumber} className="flex w-56 shrink-0 flex-col gap-4">
                <p className="text-muted-foreground/80 text-xs">Round {round.roundNumber}</p>
                {round.matches.map((match) => (
                  <BracketMatchCard key={match.id} match={match} teamNames={teamNames} seeds={seeds} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BracketMatchCard({
  match,
  teamNames,
  seeds,
}: {
  match: BracketMatchJson;
  teamNames: Map<number, string>;
  seeds: Map<number, number>;
}) {
  return (
    <div className="rounded-xl border-border/60 bg-muted/20 border p-1.5 text-sm">
      <TeamSlot teamId={match.teamAId} winnerTeamId={match.winnerTeamId} teamNames={teamNames} seeds={seeds} />
      <div className="bg-border/50 my-1 h-px" />
      <TeamSlot teamId={match.teamBId} winnerTeamId={match.winnerTeamId} teamNames={teamNames} seeds={seeds} />
      {match.status === "in_progress" && !match.winnerTeamId ? (
        <p className="text-accent-silver mt-1.5 px-2 text-xs">Live</p>
      ) : null}
    </div>
  );
}

function TeamSlot({
  teamId,
  winnerTeamId,
  teamNames,
  seeds,
}: {
  teamId?: number;
  winnerTeamId?: number;
  teamNames: Map<number, string>;
  seeds: Map<number, number>;
}) {
  const isWinner = Boolean(teamId && winnerTeamId === teamId);
  const name = teamId ? (teamNames.get(teamId) ?? `Team ${teamId}`) : null;
  const seed = teamId ? seeds.get(teamId) : undefined;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5",
        isWinner ? "bg-accent-silver/15 text-foreground font-medium" : "text-muted-foreground",
      )}
    >
      <span className="truncate">
        {seed ? <span className="text-muted-foreground mr-1.5 tabular-nums">#{seed}</span> : null}
        {name ?? "N/A"}
      </span>
      {isWinner ? <Trophy className="text-accent-silver size-3.5 shrink-0" aria-hidden /> : null}
    </div>
  );
}
