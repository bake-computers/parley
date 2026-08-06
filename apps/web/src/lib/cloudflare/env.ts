import { env } from "cloudflare:workers";
import { cloudflareOAuthEnv } from "../discord/cloudflare.js";
import type { OAuthEnvSource } from "../discord/env.js";
import type { EngineEnvSource } from "../engine/env.js";

export function cloudflareEngineEnv(): EngineEnvSource {
  // Prefer the Workers binding; fall back to process.env when
  // nodejs_compat_populate_process_env is on (local wrangler / some Start paths).
  const sharedSecret =
    env.ENGINE_SHARED_SECRET ??
    (typeof process !== "undefined" ? process.env.ENGINE_SHARED_SECRET : undefined);
  return {
    VPC_SERVICE: env.VPC_SERVICE as EngineEnvSource["VPC_SERVICE"],
    ENGINE_INTERNAL_URL: env.ENGINE_INTERNAL_URL,
    ENGINE_SHARED_SECRET: sharedSecret,
  };
}

export function cloudflareDashboardEnv(): { oauth: OAuthEnvSource; engine: EngineEnvSource } {
  return {
    oauth: cloudflareOAuthEnv(),
    engine: cloudflareEngineEnv(),
  };
}
