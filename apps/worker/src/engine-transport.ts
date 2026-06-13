import type { Fetcher } from "@cloudflare/workers-types";

export type EngineTransportEnv = {
  VPC_SERVICE?: Fetcher;
  ENGINE_INTERNAL_URL?: string;
  ENGINE_SERVICE_URL?: string;
  /**
   * When set to `"1"` or `"true"`, force the local engine at
   * `ENGINE_SERVICE_URL ?? http://localhost:50051` even if a VPC binding is
   * configured. Use this for `wrangler dev` against `cargo run` so requests
   * don't bounce through the production VPC.
   */
  USE_LOCAL_ENGINE?: string;
};

export type EngineFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type EngineTransportConfig = {
  baseUrl: string;
  cacheKey: string;
  fetchImpl: EngineFetch;
};

function isTruthy(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveEngineTransport(env: EngineTransportEnv): EngineTransportConfig {
  if (!isTruthy(env.USE_LOCAL_ENGINE) && env.VPC_SERVICE && env.ENGINE_INTERNAL_URL) {
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

  const baseUrl = env.ENGINE_SERVICE_URL ?? "http://localhost:50051";
  return {
    baseUrl,
    cacheKey: `local:${baseUrl}`,
    fetchImpl: (input, init) => fetch(input, init),
  };
}
