import { describe, expect, test } from "bun:test";
import {
  balanceTeams,
  calculateEffectiveBalanceRating,
  calculateKprFromPayloadJson,
  calculateSeedMetrics,
  type TeamCandidate,
} from "../../src/team/balance";

function payloadWithRounds(roundsPlayed: number): string {
  return JSON.stringify({
    ranked_stats: {
      rounds_played: roundsPlayed,
    },
  });
}

const DEFAULT_METRICS = {
  rankPoints: 3000,
  kdRatio: 1,
  kost: 60,
  kpr: 0.6,
  headshotPercentage: 40,
  seedScore: 100,
} as const;

function buildCandidate(
  playerId: number,
  baseBalanceRating: number,
  platform = "pc",
): TeamCandidate {
  return {
    discordUserId: `user-${playerId}`,
    playerId,
    username: `Player ${playerId}`,
    platform,
    baseBalanceRating,
    effectiveBalanceRating: calculateEffectiveBalanceRating(baseBalanceRating, platform),
    metrics: DEFAULT_METRICS,
  };
}

describe("team balance", () => {
  test("calculates KPR from payload rounds", () => {
    expect(calculateKprFromPayloadJson(payloadWithRounds(50), 25)).toBe(0.5);
  });

  test("falls back to zero KPR when rounds are missing", () => {
    expect(calculateKprFromPayloadJson("{}", 25)).toBe(0);
  });

  test("calculates seed score with percentage inputs", () => {
    const metrics = calculateSeedMetrics({
      rankPoints: 4000,
      kdRatio: 1.2,
      kost: 62,
      kills: 30,
      headshotPercentage: 48,
      payloadJson: payloadWithRounds(40),
    });

    expect(metrics.kpr).toBe(0.75);
    expect(metrics.seedScore).toBe(218.65);
  });

  test("applies a fixed console discount to effective balance rating", () => {
    expect(calculateEffectiveBalanceRating(1200, "pc")).toBe(1200);
    expect(calculateEffectiveBalanceRating(1200, "xbox")).toBe(1125);
    expect(calculateEffectiveBalanceRating(1200, "playstation")).toBe(1125);
    expect(calculateEffectiveBalanceRating(1200, "auto")).toBe(1200);
  });

  test("splits two players without rebalancing", () => {
    const players = [buildCandidate(1, 1000), buildCandidate(2, 1100)];

    const result = balanceTeams(players);

    expect(result.teamA.map((player) => player.discordUserId)).toEqual(["user-1"]);
    expect(result.teamB.map((player) => player.discordUserId)).toEqual(["user-2"]);
    expect(result.balanceGap).toBe(100);
    expect(result.teamABalanceTotal).toBe(1000);
    expect(result.teamBBalanceTotal).toBe(1100);
  });

  test("chooses the strongest player solo for a 1500/1000/1000 draft", () => {
    const players = [buildCandidate(1, 1500), buildCandidate(2, 1000), buildCandidate(3, 1000)];

    const result = balanceTeams(players);

    expect(result.teamA.map((player) => player.discordUserId)).toEqual(["user-1"]);
    expect(result.teamB.map((player) => player.discordUserId)).toEqual(["user-2", "user-3"]);
    expect(result.balanceGap).toBe(500);
  });

  test("can place the strongest player on the smaller team for odd drafts", () => {
    const players = [
      buildCandidate(1, 1700),
      buildCandidate(2, 1500),
      buildCandidate(3, 1500),
      buildCandidate(4, 1000),
      buildCandidate(5, 1000),
    ];

    const result = balanceTeams(players);

    expect(result.teamA.map((player) => player.discordUserId)).toEqual(["user-1", "user-2"]);
    expect(result.teamB.map((player) => player.discordUserId)).toEqual([
      "user-3",
      "user-4",
      "user-5",
    ]);
    expect(result.teamA).toHaveLength(2);
    expect(result.teamB).toHaveLength(3);
    expect(result.balanceGap).toBe(300);
  });

  test("prefers lower-spread teams when the balance gap is within the near-tie window", () => {
    const players = [
      buildCandidate(1, 1400),
      buildCandidate(2, 1330),
      buildCandidate(3, 1175),
      buildCandidate(4, 1150),
    ];

    const result = balanceTeams(players);

    expect(result.teamA.map((player) => player.discordUserId)).toEqual(["user-1", "user-3"]);
    expect(result.teamB.map((player) => player.discordUserId)).toEqual(["user-2", "user-4"]);
    expect(result.balanceGap).toBe(95);
  });

  test("uses lexicographic tie breaks for symmetric even drafts", () => {
    const players = [
      buildCandidate(1, 1200),
      buildCandidate(2, 1200),
      buildCandidate(3, 1200),
      buildCandidate(4, 1200),
    ];

    const result = balanceTeams(players);

    expect(result.teamA.map((player) => player.discordUserId)).toEqual(["user-1", "user-2"]);
    expect(result.teamB.map((player) => player.discordUserId)).toEqual(["user-3", "user-4"]);
    expect(result.balanceGap).toBe(0);
  });

  test("balances exactly ten players with deterministic output", () => {
    const players = Array.from({ length: 10 }, (_, index) =>
      buildCandidate(index + 1, 1000 + index),
    );

    const first = balanceTeams(players);
    const second = balanceTeams(players);

    expect(first.teamA).toHaveLength(5);
    expect(first.teamB).toHaveLength(5);
    expect(first.teamA.map((player) => player.discordUserId)).toEqual([
      "user-5",
      "user-4",
      "user-3",
      "user-2",
      "user-1",
    ]);
    expect(first.teamB.map((player) => player.discordUserId)).toEqual([
      "user-10",
      "user-9",
      "user-8",
      "user-7",
      "user-6",
    ]);
    expect(first.balanceGap).toBe(25);
    expect(
      new Set([...first.teamA, ...first.teamB].map((player) => player.discordUserId)).size,
    ).toBe(10);
    expect(first.teamA.map((player) => player.discordUserId)).toEqual(
      second.teamA.map((player) => player.discordUserId),
    );
    expect(first.teamB.map((player) => player.discordUserId)).toEqual(
      second.teamB.map((player) => player.discordUserId),
    );
  });
});
