import { describe, expect, test } from "bun:test";
import { toBridgeRequest } from "./bridge-request.js";

describe("toBridgeRequest", () => {
  test("sets Origin from the landing request URL for bridge allowlisting", () => {
    const request = new Request("http://localhost:3000/api/bridge/snapshot?type=rank_points");
    const bridgeRequest = toBridgeRequest(request, "/snapshot");

    expect(bridgeRequest.url).toBe("https://bridge.internal/snapshot?type=rank_points");
    expect(bridgeRequest.headers.get("Origin")).toBe("http://localhost:3000");
  });

  test("overrides a missing Origin on same-origin server-side fetches", () => {
    const request = new Request("http://localhost:3000/api/bridge/ws?type=elo", {
      headers: { Upgrade: "websocket" },
    });
    const bridgeRequest = toBridgeRequest(request, "/ws");

    expect(bridgeRequest.headers.get("Origin")).toBe("http://localhost:3000");
  });
});
