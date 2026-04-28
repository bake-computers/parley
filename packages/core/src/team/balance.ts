const CONSOLE_PLATFORM_BALANCE_OFFSET = -75;
const NEAR_TIE_EFFECTIVE_GAP_WINDOW = 50;

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
  baseBalanceRating: number;
  effectiveBalanceRating: number;
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

function platformBalanceOffset(platform: string): number {
  switch (platform) {
    case "xbox":
    case "playstation":
      return CONSOLE_PLATFORM_BALANCE_OFFSET;
    default:
      return 0;
  }
}

export function calculateEffectiveBalanceRating(
  baseBalanceRating: number,
  platform: string,
): number {
  return roundScore(baseBalanceRating + platformBalanceOffset(platform));
}

function sumEffectiveBalanceRatings(players: readonly TeamCandidate[]): number {
  return roundScore(players.reduce((total, player) => total + player.effectiveBalanceRating, 0));
}

function sortTeamPlayers(players: readonly TeamCandidate[]): TeamCandidate[] {
  return [...players].sort((left, right) => {
    if (right.effectiveBalanceRating !== left.effectiveBalanceRating) {
      return right.effectiveBalanceRating - left.effectiveBalanceRating;
    }
    if (right.baseBalanceRating !== left.baseBalanceRating) {
      return right.baseBalanceRating - left.baseBalanceRating;
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

function calculateTeamSpread(players: readonly TeamCandidate[]): number {
  if (players.length <= 1) {
    return 0;
  }

  const sortedPlayers = sortTeamPlayers(players);
  return roundScore(
    sortedPlayers[0]!.effectiveBalanceRating -
      sortedPlayers[sortedPlayers.length - 1]!.effectiveBalanceRating,
  );
}

interface EvaluatedBalancedTeamResult extends BalancedTeamResult {
  worstTeamSpread: number;
  spreadGap: number;
  highestRatingGap: number;
  lexKey: string;
}

function evaluateBalancedSplit(
  teamAPlayers: readonly TeamCandidate[],
  teamBPlayers: readonly TeamCandidate[],
): EvaluatedBalancedTeamResult {
  const teamA = sortTeamPlayers(teamAPlayers);
  const teamB = sortTeamPlayers(teamBPlayers);
  const teamABalanceTotal = sumEffectiveBalanceRatings(teamA);
  const teamBBalanceTotal = sumEffectiveBalanceRatings(teamB);
  const balanceGap = roundScore(Math.abs(teamABalanceTotal - teamBBalanceTotal));
  const teamASpread = calculateTeamSpread(teamA);
  const teamBSpread = calculateTeamSpread(teamB);

  return {
    teamA,
    teamB,
    teamABalanceTotal,
    teamBBalanceTotal,
    balanceGap,
    worstTeamSpread: Math.max(teamASpread, teamBSpread),
    spreadGap: roundScore(Math.abs(teamASpread - teamBSpread)),
    highestRatingGap: roundScore(
      Math.abs(teamA[0]!.effectiveBalanceRating - teamB[0]!.effectiveBalanceRating),
    ),
    lexKey: teamLexKey(teamA),
  };
}

export function balanceTeams(players: readonly TeamCandidate[]): BalancedTeamResult {
  if (players.length < 2 || players.length > 10) {
    throw new Error("Team balancing requires between 2 and 10 players.");
  }

  if (players.length === 2) {
    const teamA = [players[0]!];
    const teamB = [players[1]!];
    const teamABalanceTotal = sumEffectiveBalanceRatings(teamA);
    const teamBBalanceTotal = sumEffectiveBalanceRatings(teamB);

    return {
      teamA,
      teamB,
      teamABalanceTotal,
      teamBBalanceTotal,
      balanceGap: roundScore(Math.abs(teamABalanceTotal - teamBBalanceTotal)),
    };
  }

  const sortedPlayers = sortTeamPlayers(players);
  const teamASize = Math.floor(sortedPlayers.length / 2);
  const evaluations = chooseCombinations(sortedPlayers, teamASize).map((teamAPlayers) => {
    const teamAIds = new Set(teamAPlayers.map((player) => player.discordUserId));
    const teamBPlayers = sortedPlayers.filter((player) => !teamAIds.has(player.discordUserId));
    return evaluateBalancedSplit(teamAPlayers, teamBPlayers);
  });

  const minimumBalanceGap = Math.min(...evaluations.map((evaluation) => evaluation.balanceGap));
  const eligibleEvaluations = evaluations
    .filter(
      (evaluation) => evaluation.balanceGap <= minimumBalanceGap + NEAR_TIE_EFFECTIVE_GAP_WINDOW,
    )
    .sort((left, right) => {
      if (left.worstTeamSpread !== right.worstTeamSpread) {
        return left.worstTeamSpread - right.worstTeamSpread;
      }
      if (left.spreadGap !== right.spreadGap) {
        return left.spreadGap - right.spreadGap;
      }
      if (left.highestRatingGap !== right.highestRatingGap) {
        return left.highestRatingGap - right.highestRatingGap;
      }
      return left.lexKey.localeCompare(right.lexKey);
    });

  const best = eligibleEvaluations[0];

  if (!best) {
    throw new Error("Failed to calculate balanced teams.");
  }

  return {
    teamA: best.teamA,
    teamB: best.teamB,
    teamABalanceTotal: best.teamABalanceTotal,
    teamBBalanceTotal: best.teamBBalanceTotal,
    balanceGap: best.balanceGap,
  };
}
