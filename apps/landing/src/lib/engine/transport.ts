import type { Fetcher } from "@cloudflare/workers-types";

export type EngineTransportEnv = {
  VPC_SERVICE?: Fetcher;
  ENGINE_INTERNAL_URL?: string;
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
  return {
    baseUrl,
    cacheKey: `vpc:${baseUrl}`,
    fetchImpl: ((input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const resolved = url.startsWith("http") ? url : new URL(url, baseUrl).href;
      return vpc.fetch(resolved, (init ?? {}) as Parameters<Fetcher["fetch"]>[1]);
    }) as unknown as EngineFetch,
  };
}