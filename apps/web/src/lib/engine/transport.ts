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

  const baseUrl = env.ENGINE_INTERNAL_URL;
  const vpc = env.VPC_SERVICE;
  const secret = env.ENGINE_SHARED_SECRET ?? "";
  return {
    baseUrl,
    cacheKey: `vpc:${baseUrl}`,
    fetchImpl: (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const resolved = url.startsWith("http") ? url : new URL(url, baseUrl).href;
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${secret}`);
      return vpc.fetch(resolved, { ...init, headers });
    },
  };
}
