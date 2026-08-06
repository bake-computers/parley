export type EngineTransportEnv = {
  /** Service binding (Fetcher); structurally typed so wrangler-generated and workers-types env shapes both satisfy it. */
  VPC_SERVICE?: { fetch: EngineFetch };
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
        "Engine returned forbidden. Check ENGINE_SHARED_SECRET and that the web worker can reach the engine over VPC.",
      );
    }
    throw new Error(text.trim() || `Engine ${res.status}`);
  }

  if (!json) {
    throw new Error(text.trim() || "Engine returned an empty response");
  }
  return json;
}

/** Dashboard RPC always uses remote VPC to the Parley engine (same as production). */
export function resolveEngineTransport(env: EngineTransportEnv): EngineTransportConfig {
  if (!env.VPC_SERVICE) {
    throw new Error(
      "VPC_SERVICE is not available. Run `bun run dev` with remote bindings enabled and ensure you are logged in to Cloudflare (`wrangler login`).",
    );
  }
  if (!env.ENGINE_INTERNAL_URL) {
    throw new Error("ENGINE_INTERNAL_URL is not configured in wrangler vars.");
  }
  const secret = env.ENGINE_SHARED_SECRET?.trim() ?? "";
  if (!secret) {
    throw new Error(
      "ENGINE_SHARED_SECRET is not configured on the web worker. Set it with `wrangler secret put ENGINE_SHARED_SECRET` (same value as the engine and Discord worker).",
    );
  }

  const baseUrl = env.ENGINE_INTERNAL_URL;
  const vpc = env.VPC_SERVICE;
  return {
    baseUrl,
    cacheKey: `vpc:${baseUrl}`,
    fetchImpl: (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const resolved = url.startsWith("http") ? url : new URL(url, baseUrl).href;
      // Use Request + plain header map (Cloudflare VPC docs). Headers objects
      // have been flaky with some binding fetch paths.
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
