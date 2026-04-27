function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

function parsePayloadJson(payloadJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readRoundsPlayed(payloadJson: string): number {
  const payload = parsePayloadJson(payloadJson);
  const rankedStats =
    payload?.ranked_stats !== null && typeof payload?.ranked_stats === "object"
      ? (payload.ranked_stats as Record<string, unknown>)
      : null;
  const roundsPlayed = Number(rankedStats?.rounds_played ?? 0);
  return Number.isFinite(roundsPlayed) && roundsPlayed > 0 ? roundsPlayed : 0;
}

export interface SeedMetricsInput {
  rankPoints: number;
  kdRatio: number;
  kost: number;
  kills: number;
  headshotPercentage: number;
  payloadJson: string;
}

export interface TeamSeedMetrics {
  rankPoints: number;
  kdRatio: number;
  kost: number;
  kpr: number;
  headshotPercentage: number;
  seedScore: number;
}

export interface TeamCandidate {
  discordUserId: string;
  playerId: number;
  username: string;
  platform: string;
  balanceRating: number;
  metrics: TeamSeedMetrics;
}

export interface BalancedTeamResult {
  teamA: TeamCandidate[];
  teamB: TeamCandidate[];
  teamABalanceTotal: number;
  teamBBalanceTotal: number;
  balanceGap: number;
}

export function calculateKprFromPayloadJson(payloadJson: string, kills: number): number {
  const roundsPlayed = readRoundsPlayed(payloadJson);
  if (roundsPlayed <= 0) {
    return 0;
  }

  return Number((kills / roundsPlayed).toFixed(4));
}

export function calculateSeedMetrics(input: SeedMetricsInput): TeamSeedMetrics {
  const kpr = calculateKprFromPayloadJson(input.payloadJson, input.kills);
  const seedScore =
    (input.rankPoints / 1000) * 40 +
    input.kdRatio * 20 +
    input.kost * 0.3 +
    kpr * 15 +
    input.headshotPercentage * 0.1;

  return {
    rankPoints: input.rankPoints,
    kdRatio: input.kdRatio,
    kost: input.kost,
    kpr,
    headshotPercentage: input.headshotPercentage,
    seedScore: roundScore(seedScore),
  };
}

function sumBalanceRatings(players: readonly TeamCandidate[]): number {
  return roundScore(players.reduce((total, player) => total + player.balanceRating, 0));
}

function sortTeamPlayers(players: readonly TeamCandidate[]): TeamCandidate[] {
  return [...players].sort((left, right) => {
    if (right.balanceRating !== left.balanceRating) {
      return right.balanceRating - left.balanceRating;
    }
    return left.discordUserId.localeCompare(right.discordUserId);
  });
}

function teamLexKey(players: readonly TeamCandidate[]): string {
  return [...players]
    .map((player) => player.discordUserId)
    .sort((left, right) => left.localeCompare(right))
    .join(",");
}

function chooseCombinations<T>(
  source: readonly T[],
  size: number,
  startIndex = 0,
  current: T[] = [],
  results: T[][] = [],
): T[][] {
  if (current.length === size) {
    results.push([...current]);
    return results;
  }

  for (let index = startIndex; index <= source.length - (size - current.length); index += 1) {
    current.push(source[index]!);
    chooseCombinations(source, size, index + 1, current, results);
    current.pop();
  }

  return results;
}

export function balanceTeams(players: readonly TeamCandidate[]): BalancedTeamResult {
  if (players.length < 2 || players.length > 10) {
    throw new Error("Team balancing requires between 2 and 10 players.");
  }

  if (players.length === 2) {
    const teamA = [players[0]!];
    const teamB = [players[1]!];
    const teamABalanceTotal = sumBalanceRatings(teamA);
    const teamBBalanceTotal = sumBalanceRatings(teamB);

    return {
      teamA,
      teamB,
      teamABalanceTotal,
      teamBBalanceTotal,
      balanceGap: roundScore(Math.abs(teamABalanceTotal - teamBBalanceTotal)),
    };
  }

  const teamASize = Math.ceil(players.length / 2);
  const sortedPlayers = sortTeamPlayers(players);
  const anchor = sortedPlayers[0]!;
  const remaining = sortedPlayers.slice(1);
  const combinations = chooseCombinations(remaining, teamASize - 1);

  let best: BalancedTeamResult | null = null;
  let bestHighestRatingGap = Number.POSITIVE_INFINITY;
  let bestLexKey = "";

  for (const combo of combinations) {
    const teamA = sortTeamPlayers([anchor, ...combo]);
    const teamAIds = new Set(teamA.map((player) => player.discordUserId));
    const teamB = sortTeamPlayers(
      remaining.filter((player) => !teamAIds.has(player.discordUserId)),
    );
    const teamABalanceTotal = sumBalanceRatings(teamA);
    const teamBBalanceTotal = sumBalanceRatings(teamB);
    const balanceGap = roundScore(Math.abs(teamABalanceTotal - teamBBalanceTotal));
    const highestRatingGap = roundScore(
      Math.abs(teamA[0]!.balanceRating - teamB[0]!.balanceRating),
    );
    const lexKey = teamLexKey(teamA);

    const shouldReplace =
      best === null ||
      balanceGap < best.balanceGap ||
      (balanceGap === best.balanceGap && highestRatingGap < bestHighestRatingGap) ||
      (balanceGap === best.balanceGap &&
        highestRatingGap === bestHighestRatingGap &&
        lexKey.localeCompare(bestLexKey) < 0);

    if (!shouldReplace) {
      continue;
    }

    best = {
      teamA,
      teamB,
      teamABalanceTotal,
      teamBBalanceTotal,
      balanceGap,
    };
    bestHighestRatingGap = highestRatingGap;
    bestLexKey = lexKey;
  }

  if (!best) {
    throw new Error("Failed to calculate balanced teams.");
  }

  return best;
}
