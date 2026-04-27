const DEFAULT_K_FACTOR = 32;

export type MatchWinner = "A" | "B";

export interface TeamEloDeltaInput {
  teamARating: number;
  teamBRating: number;
  winner: MatchWinner;
  kFactor?: number;
}

export function roundInternalElo(value: number): number {
  return Math.round(value);
}

export function seedScoreToInternalElo(seedScore: number): number {
  return roundInternalElo(800 + seedScore * 2);
}

export function calculateExpectedScore(teamRating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - teamRating) / 400));
}

export function calculateTeamEloDelta(input: TeamEloDeltaInput): number {
  const expectedScore = calculateExpectedScore(input.teamARating, input.teamBRating);
  const actualScore = input.winner === "A" ? 1 : 0;
  const kFactor = input.kFactor ?? DEFAULT_K_FACTOR;
  return roundInternalElo(kFactor * (actualScore - expectedScore));
}
