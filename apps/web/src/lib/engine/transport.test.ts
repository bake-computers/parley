import { describe, expect, test } from "vite-plus/test";
import { readEngineResponse, resolveEngineTransport } from "./transport.js";

describe("resolveEngineTransport", () => {
  test("requires VPC_SERVICE", () => {
    expect(() =>
      resolveEngineTransport({
        ENGINE_INTERNAL_URL: "http://engine.internal:50051",
        ENGINE_SHARED_SECRET: "secret",
      }),
    ).toThrow(/VPC_SERVICE/);
  });

  test("requires ENGINE_SHARED_SECRET", () => {
    expect(() =>
      resolveEngineTransport({
        VPC_SERVICE: { fetch: () => Promise.resolve(new Response("ok")) },
        ENGINE_INTERNAL_URL: "http://engine.internal:50051",
      }),
    ).toThrow(/ENGINE_SHARED_SECRET/);
  });

  test("injects bearer secret on fetch", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const transport = resolveEngineTransport({
      VPC_SERVICE: {
        fetch: (input, init) => {
          const url = typeof input === "string" ? input : String(input);
          calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
          return Promise.resolve(Response.json({ ok: true }));
        },
      },
      ENGINE_INTERNAL_URL: "http://engine.internal:50051",
      ENGINE_SHARED_SECRET: "s3cret",
    });

    await transport.fetchImpl("/health", { method: "GET" });
    expect(calls).toEqual([
      { url: "http://engine.internal:50051/health", auth: "Bearer s3cret" },
    ]);
  });
});

describe("readEngineResponse", () => {
  test("parses JSON success bodies", async () => {
    await expect(readEngineResponse<{ ok: boolean }>(Response.json({ ok: true }))).resolves.toEqual(
      { ok: true },
    );
  });

  test("maps plain-text 401 to a shared-secret hint", async () => {
    await expect(readEngineResponse(new Response("Unauthorized", { status: 401 }))).rejects.toThrow(
      /ENGINE_SHARED_SECRET/,
    );
  });

  test("maps plain-text 403 to a VPC/auth hint", async () => {
    await expect(readEngineResponse(new Response("Forbidden", { status: 403 }))).rejects.toThrow(
      /forbidden/i,
    );
  });

  test("prefers Connect-style error messages", async () => {
    await expect(
      readEngineResponse(
        Response.json({ error: { code: "permission_denied", message: "not a member" } }, { status: 403 }),
      ),
    ).rejects.toThrow("not a member");
  });
});
