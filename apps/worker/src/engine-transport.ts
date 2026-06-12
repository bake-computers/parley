import type { Fetcher } from "@cloudflare/workers-types";

export type EngineTransportEnv = {
  VPC_SERVICE?: Fetcher;
  ENGINE_INTERNAL_URL?: string;
  ENGINE_SERVICE_URL?: string;
};

export type EngineFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type EngineTransportConfig = {
  baseUrl: string;
  cacheKey: string;
  fetchImpl: EngineFetch;
};

export function resolveEngineTransport(env: EngineTransportEnv): EngineTransportConfig {
  if (env.VPC_SERVICE && env.ENGINE_INTERNAL_URL) {
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
