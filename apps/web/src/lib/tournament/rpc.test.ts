import { describe, expect, test } from "vite-plus/test";
import { rpcListGuildMembers, rpcTournamentAction } from "./rpc.js";

type EngineCall = {
  url: string;
  headers: Headers;
  bodyText: string;
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

// The VPC transport passes a Request (plain header map) rather than string+init.
function capture(fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  const calls: EngineCall[] = [];
  const wrapped = async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    calls.push({ url: req.url, headers: req.headers, bodyText: await req.text(), init });
    return fetchImpl(input, init);
  };
  return { calls, wrapped };
}

describe("tournament RPC transport", () => {
  test("forwards the verified acting user for lifecycle actions", async () => {
    const { calls, wrapped } = capture(() =>
      Promise.resolve(
        Response.json({ success: true, tournament: { teams: [], bracketMatches: [] } }),
      ),
    );

    await rpcTournamentAction(
      testEnv(wrapped),
      "StartTournament",
      { tournamentId: 42, game: 1, minTeams: 2 },
      " user-1 ",
    );

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) {
      return;
    }
    expect(call.init).toBeUndefined();
    expect(call.url).toBe(
      "https://engine.example/parley.tournament.v1.TournamentService/StartTournament",
    );
    expect(call.headers.get("authorization")).toBe("Bearer engine-secret");
    expect(call.headers.get("x-parley-acting-discord-user-id")).toBe("user-1");
  });

  test("loads eligible linked members through the engine", async () => {
    const { calls, wrapped } = capture(() =>
      Promise.resolve(
        Response.json({
          success: true,
          members: [{ discordUserId: "user-1", username: "Alpha", platform: "pc" }],
        }),
      ),
    );

    await expect(rpcListGuildMembers(testEnv(wrapped), "guild-1")).resolves.toEqual([
      { discordUserId: "user-1", username: "Alpha", platform: "pc" },
    ]);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) {
      return;
    }
    expect(call.url).toBe(
      "https://engine.example/parley.matchmaking.v1.MatchmakingService/ListGuildMembers",
    );
    expect(JSON.parse(call.bodyText)).toEqual({
      guildId: "guild-1",
      game: 1,
      limit: 2000,
    });
  });
});
