import { describe, expect, test } from "bun:test";
import { withFollowRedirect } from "#/transport";

describe("withFollowRedirect", () => {
  test("rewrites redirect: 'error' to 'follow' on the request init", async () => {
    const calls: Array<[string | URL, RequestInit | undefined]> = [];
    const stub: typeof fetch = ((input, init) => {
      calls.push([input as string | URL, init]);
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as typeof fetch;

    const wrapped = withFollowRedirect(stub);
    await wrapped("http://example.com", { redirect: "error", method: "POST" });

    expect(calls).toHaveLength(1);
    const init = calls[0]?.[1];
    expect(init?.redirect).toBe("follow");
    expect(init?.method).toBe("POST");
  });

  test("preserves other init fields (headers, body, signal)", async () => {
    const calls: Array<[string | URL, RequestInit | undefined]> = [];
    const stub: typeof fetch = ((input, init) => {
      calls.push([input as string | URL, init]);
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as typeof fetch;

    const controller = new AbortController();
    const wrapped = withFollowRedirect(stub);
    await wrapped("http://example.com", {
      redirect: "error",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });

    const init = calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(init?.body).toBe("{}");
    expect(init?.signal).toBe(controller.signal);
    expect(init?.redirect).toBe("follow");
  });

  test("tolerates undefined init", async () => {
    const calls: Array<[string | URL, RequestInit | undefined]> = [];
    const stub: typeof fetch = ((input, init) => {
      calls.push([input as string | URL, init]);
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as typeof fetch;

    const wrapped = withFollowRedirect(stub);
    await wrapped("http://example.com");

    const init = calls[0]?.[1];
    expect(init?.redirect).toBe("follow");
  });
});
