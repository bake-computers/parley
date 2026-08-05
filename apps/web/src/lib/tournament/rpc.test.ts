import { describe, expect, test } from "vite-plus/test";
import { rpcListGuildMembers, rpcTournamentAction } from "./rpc.js";

type EngineCall = {
  input: string | URL | Request;
  init?: RequestInit;
};

function testEnv(
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
) {
  return {
    ENGINE_INTERNAL_URL: "https://engine.example",
    ENGINE_SHARED_SECRET: "engine-secret",
    VPC_SERVICE: { fetch: fetchImpl },
  };
}

describe("tournament RPC transport", () => {
  test("forwards the verified acting user for lifecycle actions", async () => {
    const calls: EngineCall[] = [];
    const fetchImpl = (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input, init });
      return Promise.resolve(
        Response.json({ success: true, tournament: { teams: [], bracketMatches: [] } }),
      );
    };

    await rpcTournamentAction(
      testEnv(fetchImpl),
      "StartTournament",
      { tournamentId: 42, game: 1, minTeams: 2 },
      " user-1 ",
    );

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) {
      return;
    }
    expect(String(call.input)).toBe(
      "https://engine.example/parley.tournament.v1.TournamentService/StartTournament",
    );
    const headers = new Headers(call.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer engine-secret");
    expect(headers.get("x-parley-acting-discord-user-id")).toBe("user-1");
  });

  test("loads eligible linked members through the engine", async () => {
    const calls: EngineCall[] = [];
    const fetchImpl = (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input, init });
      return Promise.resolve(
        Response.json({
          success: true,
          members: [{ discordUserId: "user-1", username: "Alpha", platform: "pc" }],
        }),
      );
    };

    await expect(rpcListGuildMembers(testEnv(fetchImpl), "guild-1")).resolves.toEqual([
      { discordUserId: "user-1", username: "Alpha", platform: "pc" },
    ]);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) {
      return;
    }
    expect(String(call.input)).toBe(
      "https://engine.example/parley.matchmaking.v1.MatchmakingService/ListGuildMembers",
    );
    expect(JSON.parse(String(call.init?.body))).toEqual({
      guildId: "guild-1",
      game: 1,
      limit: 2000,
    });
  });
});
