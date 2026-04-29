export interface TournamentSeedCandidate {
  id: number;
  joinedAt: number;
  stackBalanceAverage: number;
  stackBalanceTotal: number;
}

export interface TournamentSeedAssignment extends TournamentSeedCandidate {
  seedNumber: number;
}

export function buildStandardSeedPlacementOrder(teamCount: number): number[] {
  if (teamCount < 2 || (teamCount & (teamCount - 1)) !== 0) {
    throw new Error("Tournament team count must be a power of two.");
  }

  let order = [1];
  let size = 2;
  while (size <= teamCount) {
    order = order.flatMap((seed) => [seed, size + 1 - seed]);
    size *= 2;
  }

  return order;
}

export function seedTournamentEntries(
  entries: readonly TournamentSeedCandidate[],
): TournamentSeedAssignment[] {
  return [...entries]
    .sort((left, right) => {
      if (left.stackBalanceAverage !== right.stackBalanceAverage) {
        return right.stackBalanceAverage - left.stackBalanceAverage;
      }
      if (left.stackBalanceTotal !== right.stackBalanceTotal) {
        return right.stackBalanceTotal - left.stackBalanceTotal;
      }
      if (left.joinedAt !== right.joinedAt) {
        return left.joinedAt - right.joinedAt;
      }
      return left.id - right.id;
    })
    .map((entry, index) => ({
      ...entry,
      seedNumber: index + 1,
    }));
}
