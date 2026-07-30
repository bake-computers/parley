import { Trophy } from "lucide-react";
import type { BracketMatchJson } from "#/lib/tournament/rpc";
import { cn } from "#/lib/shared/cn";

export type BracketTeam = { id: number; teamName: string };

export type BracketRound = {
  roundNumber: number;
  matches: BracketMatchJson[];
};

export type BracketGroup = {
  bracket: string;
  rounds: BracketRound[];
};

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
                  <BracketMatchCard key={match.id} match={match} teamNames={teamNames} />
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
}: {
  match: BracketMatchJson;
  teamNames: Map<number, string>;
}) {
  return (
    <div className="rounded-xl border-border/60 bg-muted/20 border p-1.5 text-sm">
      <TeamSlot teamId={match.teamAId} winnerTeamId={match.winnerTeamId} teamNames={teamNames} />
      <div className="bg-border/50 my-1 h-px" />
      <TeamSlot teamId={match.teamBId} winnerTeamId={match.winnerTeamId} teamNames={teamNames} />
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
}: {
  teamId?: number;
  winnerTeamId?: number;
  teamNames: Map<number, string>;
}) {
  const isWinner = Boolean(teamId && winnerTeamId === teamId);
  const name = teamId ? (teamNames.get(teamId) ?? `Team ${teamId}`) : null;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5",
        isWinner ? "bg-accent-silver/15 text-foreground font-medium" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{name ?? "TBD"}</span>
      {isWinner ? <Trophy className="text-accent-silver size-3.5 shrink-0" aria-hidden /> : null}
    </div>
  );
}
