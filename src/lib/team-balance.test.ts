import { describe, expect, test } from "bun:test";
import { balanceTeams, calculateKprFromPayloadJson, calculateSeedMetrics } from "./team-balance";

function payloadWithRounds(roundsPlayed: number): string {
  return JSON.stringify({
    ranked_stats: {
      rounds_played: roundsPlayed,
    },
  });
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

  test("splits two players without rebalancing", () => {
    const players = Array.from({ length: 2 }, (_, index) => ({
      discordUserId: `user-${index + 1}`,
      playerId: index + 1,
      username: `Player ${index + 1}`,
      platform: "pc",
      balanceRating: 1000 + index * 100,
      metrics: {
        rankPoints: 3000,
        kdRatio: 1,
        kost: 60,
        kpr: 0.6,
        headshotPercentage: 40,
        seedScore: 100,
      },
    }));

    const result = balanceTeams(players);

    expect(result.teamA.map((player) => player.discordUserId)).toEqual(["user-1"]);
    expect(result.teamB.map((player) => player.discordUserId)).toEqual(["user-2"]);
    expect(result.balanceGap).toBe(100);
  });

  test("balances three players into a 2v1 split", () => {
    const players = Array.from({ length: 3 }, (_, index) => ({
      discordUserId: `user-${index + 1}`,
      playerId: index + 1,
      username: `Player ${index + 1}`,
      platform: "pc",
      balanceRating: 1200 - index * 50,
      metrics: {
        rankPoints: 3000,
        kdRatio: 1,
        kost: 60,
        kpr: 0.6,
        headshotPercentage: 40,
        seedScore: 100,
      },
    }));

    const result = balanceTeams(players);

    expect(result.teamA).toHaveLength(2);
    expect(result.teamB).toHaveLength(1);
  });

  test("balances five players into a 3v2 split", () => {
    const players = Array.from({ length: 5 }, (_, index) => ({
      discordUserId: `user-${index + 1}`,
      playerId: index + 1,
      username: `Player ${index + 1}`,
      platform: "pc",
      balanceRating: 1400 - index * 60,
      metrics: {
        rankPoints: 3000,
        kdRatio: 1,
        kost: 60,
        kpr: 0.6,
        headshotPercentage: 40,
        seedScore: 100,
      },
    }));

    const result = balanceTeams(players);

    expect(result.teamA).toHaveLength(3);
    expect(result.teamB).toHaveLength(2);
  });

  test("balances exactly ten players with deterministic tie breaks", () => {
    const players = Array.from({ length: 10 }, (_, index) => ({
      discordUserId: `user-${index + 1}`,
      playerId: index + 1,
      username: `Player ${index + 1}`,
      platform: "pc",
      balanceRating: 1000 + index,
      metrics: {
        rankPoints: 3000 + index * 10,
        kdRatio: 1,
        kost: 60,
        kpr: 0.6,
        headshotPercentage: 40,
        seedScore: 100 + index,
      },
    }));

    const result = balanceTeams(players);

    expect(result.teamA).toHaveLength(5);
    expect(result.teamB).toHaveLength(5);
    expect(result.balanceGap).toBeLessThanOrEqual(1);
    expect(
      new Set([...result.teamA, ...result.teamB].map((player) => player.discordUserId)).size,
    ).toBe(10);
  });
});
