import { describe, it, expect, mock } from "bun:test";
import { resolveEngineTransport } from "../engine-transport.js";

describe("engine transport", () => {
  it("routes fetch through VPC_SERVICE when binding is present", async () => {
    const vpcFetch = mock((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(new Response("ok")),
    );

    const config = resolveEngineTransport({
      VPC_SERVICE: { fetch: vpcFetch } as never,
      ENGINE_INTERNAL_URL: "http://api.internal.parley.bot:50051",
    });

    expect(config.baseUrl).toBe("http://api.internal.parley.bot:50051");
    expect(config.cacheKey).toBe("vpc:http://api.internal.parley.bot:50051");

    await config.fetchImpl("/parley.identity.v1.IdentityService/LinkAccount", {
      method: "POST",
    });

    expect(vpcFetch).toHaveBeenCalledTimes(1);
    const firstCall = vpcFetch.mock.calls[0];
    const url = firstCall?.[0];
    expect(String(url)).toBe(
      "http://api.internal.parley.bot:50051/parley.identity.v1.IdentityService/LinkAccount",
    );
  });

  it("uses local fetch when VPC binding is absent", () => {
    const config = resolveEngineTransport({
      ENGINE_SERVICE_URL: "http://localhost:50051",
    });

    expect(config.baseUrl).toBe("http://localhost:50051");
    expect(config.cacheKey).toBe("local:http://localhost:50051");
    expect(typeof config.fetchImpl).toBe("function");
  });
});
