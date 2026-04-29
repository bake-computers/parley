import { buildStandardSeedPlacementOrder } from "./seeding";

export type TournamentBracketFormat = "double" | "single";
export type TournamentBracketKind = "grand_final" | "lower" | "upper";
export type TournamentBracketMatchStatus = "ready" | "waiting";
export type TournamentBracketSlot = "A" | "B";

export interface TournamentBracketNode {
  key: string;
  bracket: TournamentBracketKind;
  roundNumber: number;
  matchNumber: number;
  status: TournamentBracketMatchStatus;
  entryASeedNumber: number | null;
  entryBSeedNumber: number | null;
  winnerToKey: string | null;
  winnerToSlot: TournamentBracketSlot | null;
  loserToKey: string | null;
  loserToSlot: TournamentBracketSlot | null;
}

function buildUpperKey(roundNumber: number, matchNumber: number): string {
  return `upper:${roundNumber}:${matchNumber}`;
}

function buildLowerKey(roundNumber: number, matchNumber: number): string {
  return `lower:${roundNumber}:${matchNumber}`;
}

function buildGrandFinalKey(): string {
  return "grand_final:1:1";
}

function buildSingleEliminationBracket(teamCount: number): TournamentBracketNode[] {
  const nodes: TournamentBracketNode[] = [];
  const placementOrder = buildStandardSeedPlacementOrder(teamCount);
  const upperRoundCount = Math.log2(teamCount);

  for (let roundNumber = 1; roundNumber <= upperRoundCount; roundNumber += 1) {
    const matchCount = teamCount / 2 ** roundNumber;
    for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
      const key = buildUpperKey(roundNumber, matchNumber);
      const nextRoundKey =
        roundNumber < upperRoundCount
          ? buildUpperKey(roundNumber + 1, Math.ceil(matchNumber / 2))
          : null;
      const nextSlot = nextRoundKey ? (matchNumber % 2 === 1 ? "A" : "B") : null;
      const placementIndex = (matchNumber - 1) * 2;

      nodes.push({
        key,
        bracket: "upper",
        roundNumber,
        matchNumber,
        status: roundNumber === 1 ? "ready" : "waiting",
        entryASeedNumber: roundNumber === 1 ? (placementOrder[placementIndex] ?? null) : null,
        entryBSeedNumber: roundNumber === 1 ? (placementOrder[placementIndex + 1] ?? null) : null,
        winnerToKey: nextRoundKey,
        winnerToSlot: nextSlot,
        loserToKey: null,
        loserToSlot: null,
      });
    }
  }

  return nodes;
}

function buildDoubleEliminationBracket(teamCount: number): TournamentBracketNode[] {
  const nodes: TournamentBracketNode[] = [];
  const placementOrder = buildStandardSeedPlacementOrder(teamCount);
  const upperRoundCount = Math.log2(teamCount);
  const lowerRoundCount = Math.max(0, (upperRoundCount - 1) * 2);
  const grandFinalKey = buildGrandFinalKey();

  for (let roundNumber = 1; roundNumber <= upperRoundCount; roundNumber += 1) {
    const matchCount = teamCount / 2 ** roundNumber;
    for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
      const key = buildUpperKey(roundNumber, matchNumber);
      const nextUpperKey =
        roundNumber < upperRoundCount
          ? buildUpperKey(roundNumber + 1, Math.ceil(matchNumber / 2))
          : grandFinalKey;
      const nextUpperSlot =
        roundNumber < upperRoundCount ? (matchNumber % 2 === 1 ? "A" : "B") : "A";
      let loserToKey: string | null = null;
      let loserToSlot: TournamentBracketSlot | null = null;

      if (roundNumber === 1) {
        loserToKey = buildLowerKey(1, Math.ceil(matchNumber / 2));
        loserToSlot = matchNumber % 2 === 1 ? "A" : "B";
      } else {
        loserToKey = buildLowerKey(roundNumber * 2 - 2, matchNumber);
        loserToSlot = "B";
      }

      const placementIndex = (matchNumber - 1) * 2;
      nodes.push({
        key,
        bracket: "upper",
        roundNumber,
        matchNumber,
        status: roundNumber === 1 ? "ready" : "waiting",
        entryASeedNumber: roundNumber === 1 ? (placementOrder[placementIndex] ?? null) : null,
        entryBSeedNumber: roundNumber === 1 ? (placementOrder[placementIndex + 1] ?? null) : null,
        winnerToKey: nextUpperKey,
        winnerToSlot: nextUpperSlot,
        loserToKey,
        loserToSlot,
      });
    }
  }

  for (let roundNumber = 1; roundNumber <= lowerRoundCount; roundNumber += 1) {
    const lowerPairIndex = Math.ceil(roundNumber / 2);
    const matchCount = teamCount / 2 ** (lowerPairIndex + 1);
    for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
      const key = buildLowerKey(roundNumber, matchNumber);
      const isOddRound = roundNumber % 2 === 1;
      let winnerToKey: string | null = null;
      let winnerToSlot: TournamentBracketSlot | null = null;

      if (roundNumber === lowerRoundCount) {
        winnerToKey = grandFinalKey;
        winnerToSlot = "B";
      } else if (isOddRound) {
        winnerToKey = buildLowerKey(roundNumber + 1, matchNumber);
        winnerToSlot = "A";
      } else {
        winnerToKey = buildLowerKey(roundNumber + 1, Math.ceil(matchNumber / 2));
        winnerToSlot = matchNumber % 2 === 1 ? "A" : "B";
      }

      nodes.push({
        key,
        bracket: "lower",
        roundNumber,
        matchNumber,
        status: "waiting",
        entryASeedNumber: null,
        entryBSeedNumber: null,
        winnerToKey,
        winnerToSlot,
        loserToKey: null,
        loserToSlot: null,
      });
    }
  }

  nodes.push({
    key: grandFinalKey,
    bracket: "grand_final",
    roundNumber: 1,
    matchNumber: 1,
    status: "waiting",
    entryASeedNumber: null,
    entryBSeedNumber: null,
    winnerToKey: null,
    winnerToSlot: null,
    loserToKey: null,
    loserToSlot: null,
  });

  return nodes;
}

export function buildTournamentBracket(
  format: TournamentBracketFormat,
  teamCount: number,
): TournamentBracketNode[] {
  if (format === "single") {
    return buildSingleEliminationBracket(teamCount);
  }
  return buildDoubleEliminationBracket(teamCount);
}
