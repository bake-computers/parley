import type { Fetcher } from "@cloudflare/workers-types";

export type EngineTransportEnv = {
  VPC_SERVICE?: Fetcher;
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

function withEngineAuth(fetchImpl: EngineFetch, secret: string | undefined): EngineFetch {
  const token = (secret ?? "").trim();
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetchImpl(input, { ...init, headers });
  };
}

export function resolveEngineTransport(env: EngineTransportEnv): EngineTransportConfig {
  if (env.VPC_SERVICE && env.ENGINE_INTERNAL_URL) {
    const baseUrl = env.ENGINE_INTERNAL_URL;
    const vpc = env.VPC_SERVICE;
    return {
      baseUrl,
      cacheKey: `vpc:${baseUrl}`,
      fetchImpl: withEngineAuth(
        ((input: string | URL | Request, init?: RequestInit) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          const resolved = url.startsWith("http") ? url : new URL(url, baseUrl).href;
          return vpc.fetch(resolved, (init ?? {}) as Parameters<Fetcher["fetch"]>[1]);
        }) as unknown as EngineFetch,
        env.ENGINE_SHARED_SECRET,
      ),
    };
  }

  const baseUrl = env.ENGINE_INTERNAL_URL ?? "http://127.0.0.1:50051";
  return {
    baseUrl,
    cacheKey: `local:${baseUrl}`,
    fetchImpl: withEngineAuth((input, init) => fetch(input, init), env.ENGINE_SHARED_SECRET),
  };
}
