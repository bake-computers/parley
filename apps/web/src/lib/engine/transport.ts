export type EngineTransportEnv = {
  /** Service binding (Fetcher); structurally typed so wrangler-generated and workers-types env shapes both satisfy it. */
  VPC_SERVICE?: { fetch: EngineFetch };
  /** Internal engine URL over the VPC binding (production) or local engine (dev). */
  ENGINE_INTERNAL_URL?: string;
  /**
   * Shared secret the engine requires on every non-probe route
   * (`Authorization: Bearer <secret>`). Must match the engine's
   * ENGINE_SHARED_SECRET.
   */
  ENGINE_SHARED_SECRET?: string;
};

export type EngineFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type EngineTransportConfig = {
  baseUrl: string;
  cacheKey: string;
  fetchImpl: EngineFetch;
};

export type RpcError = { code?: string; message?: string };

function requireEngineSecret(env: EngineTransportEnv): string {
  const secret = env.ENGINE_SHARED_SECRET?.trim() ?? "";
  if (!secret) {
    throw new Error(
      "ENGINE_SHARED_SECRET is not configured on the web worker. Set it with `wrangler secret put ENGINE_SHARED_SECRET` (same value as the engine and Discord worker).",
    );
  }
  return secret;
}

function withEngineAuth(fetchImpl: EngineFetch, secret: string): EngineFetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${secret}`);
    return fetchImpl(input, { ...init, headers });
  };
}

/**
 * Parse an engine HTTP response. Fiber auth failures return plain text
 * (e.g. "Unauthorized"); Connect errors return JSON. Map both to a clear Error.
 */
export async function readEngineResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: (T & { error?: RpcError; message?: string }) | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as T & { error?: RpcError; message?: string };
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const fromJson = json?.error?.message ?? json?.message;
    if (fromJson) {
      throw new Error(fromJson);
    }
    if (res.status === 401 || /^unauthorized$/i.test(text.trim())) {
      throw new Error(
        "Engine rejected authentication. Set ENGINE_SHARED_SECRET on the web worker to the same value as the engine and Discord worker (`wrangler secret put ENGINE_SHARED_SECRET`).",
      );
    }
    if (res.status === 403 || /^forbidden$/i.test(text.trim())) {
      throw new Error(
        "Engine returned forbidden. Check ENGINE_SHARED_SECRET and that the web worker can reach the engine (VPC or local ENGINE_INTERNAL_URL).",
      );
    }
    throw new Error(text.trim() || `Engine ${res.status}`);
  }

  if (!json) {
    throw new Error(text.trim() || "Engine returned an empty response");
  }
  return json;
}

/**
 * Resolve how the dashboard reaches the engine:
 *
 * - VPC: when a `VPC_SERVICE` binding plus `ENGINE_INTERNAL_URL` are present
 *   (production, remote dev without `env.local`).
 * - Local: plain `fetch` to `ENGINE_INTERNAL_URL ?? http://127.0.0.1:50051`
 *   (local engine dev; `env.local` sets ENGINE_INTERNAL_URL to 127.0.0.1:50051
 *   and drops the VPC binding, so no flag is needed).
 *
 * Always attaches `Authorization: Bearer <ENGINE_SHARED_SECRET>`.
 */
export function resolveEngineTransport(env: EngineTransportEnv): EngineTransportConfig {
  const secret = requireEngineSecret(env);

  if (env.VPC_SERVICE && env.ENGINE_INTERNAL_URL) {
    const baseUrl = env.ENGINE_INTERNAL_URL;
    const vpc = env.VPC_SERVICE;
    return {
      baseUrl,
      cacheKey: `vpc:${baseUrl}`,
      fetchImpl: (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const resolved = url.startsWith("http") ? url : new URL(url, baseUrl).href;
        // Pass a Request with a plain header map (Cloudflare VPC docs); Headers
        // objects have been flaky with some VPC binding fetch paths.
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${secret}`);
        const headerInit: Record<string, string> = {};
        headers.forEach((value, key) => {
          headerInit[key] = value;
        });
        return vpc.fetch(
          new Request(resolved, {
            method: init?.method ?? "GET",
            headers: headerInit,
            body: init?.body,
            redirect: init?.redirect,
          }),
        );
      },
    };
  }

  const baseUrl = env.ENGINE_INTERNAL_URL ?? "http://127.0.0.1:50051";
  return {
    baseUrl,
    cacheKey: `local:${baseUrl}`,
    fetchImpl: withEngineAuth((input, init) => fetch(input, init), secret),
  };
}
