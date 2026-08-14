import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { readEngineResponse, resolveEngineTransport } from "./transport.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveEngineTransport", () => {
  test("uses plain fetch to ENGINE_INTERNAL_URL when no VPC binding (local)", async () => {
    const calls: Array<{ url: string; auth: string | null; requestId: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(new URL(String(input), "http://127.0.0.1:50051"), init);
        calls.push({
          url: req.url,
          auth: req.headers.get("authorization"),
          requestId: req.headers.get("x-request-id"),
        });
        return Promise.resolve(Response.json({ ok: true }));
      }),
    );

    const transport = resolveEngineTransport({
      ENGINE_INTERNAL_URL: "http://127.0.0.1:50051",
      ENGINE_SHARED_SECRET: "s3cret",
    });
    expect(transport.cacheKey).toBe("local:http://127.0.0.1:50051");

    await transport.fetchImpl("/health", { method: "GET" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.auth).toBe("Bearer s3cret");
    expect(calls[0]?.requestId).toBeTruthy();
    expect(String(calls[0]?.url)).toBe("http://127.0.0.1:50051/health");
  });

  test("falls back to 127.0.0.1 when ENGINE_INTERNAL_URL is missing", () => {
    const withInternal = resolveEngineTransport({
      ENGINE_INTERNAL_URL: "http://engine.internal:50051",
      ENGINE_SHARED_SECRET: "s3cret",
    });
    expect(withInternal.cacheKey).toBe("local:http://engine.internal:50051");

    const defaulted = resolveEngineTransport({ ENGINE_SHARED_SECRET: "s3cret" });
    expect(defaulted.cacheKey).toBe("local:http://127.0.0.1:50051");
  });

  test("uses the VPC binding when present (production / remote dev)", async () => {
    const calls: Array<{ req: Request; init?: RequestInit }> = [];
    const transport = resolveEngineTransport({
      VPC_SERVICE: {
        fetch: (input, init) => {
          const req = input instanceof Request ? input : new Request(String(input), init);
          calls.push({ req, init });
          return Promise.resolve(Response.json({ ok: true }));
        },
      },
      ENGINE_INTERNAL_URL: "http://engine.internal:50051",
      ENGINE_SHARED_SECRET: "s3cret",
    });
    expect(transport.cacheKey).toBe("vpc:http://engine.internal:50051");

    await transport.fetchImpl("/health", { method: "GET" });
    expect(calls).toHaveLength(1);
    // VPC path must pass a Request (with a plain header map), not a string+init.
    expect(calls[0]?.init).toBeUndefined();
    expect(calls[0]?.req.headers.get("authorization")).toBe("Bearer s3cret");
    expect(calls[0]?.req.headers.get("x-request-id")).toBeTruthy();
    expect(calls[0]?.req.url).toContain("http://engine.internal:50051/health");
  });

  test("requires ENGINE_SHARED_SECRET on the local path", () => {
    expect(() => resolveEngineTransport({ ENGINE_INTERNAL_URL: "http://127.0.0.1:50051" })).toThrow(
      /ENGINE_SHARED_SECRET/,
    );
  });

  test("requires ENGINE_SHARED_SECRET on the VPC path", () => {
    expect(() =>
      resolveEngineTransport({
        VPC_SERVICE: { fetch: () => Promise.resolve(new Response("ok")) },
        ENGINE_INTERNAL_URL: "http://engine.internal:50051",
      }),
    ).toThrow(/ENGINE_SHARED_SECRET/);
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
