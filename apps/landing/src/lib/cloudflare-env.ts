import { env } from "cloudflare:workers";
import { cloudflareOAuthEnv } from "./discord-oauth-cloudflare.js";
import type { OAuthEnvSource } from "./discord-oauth-env.js";
import type { EngineEnvSource } from "./engine-env.js";

export function cloudflareEngineEnv(): EngineEnvSource {
  return {
    VPC_SERVICE: env.VPC_SERVICE as EngineEnvSource["VPC_SERVICE"],
    ENGINE_INTERNAL_URL: env.ENGINE_INTERNAL_URL,
    ENGINE_SERVICE_URL: env.ENGINE_SERVICE_URL,
    USE_LOCAL_ENGINE: env.USE_LOCAL_ENGINE,
  };
}

export function cloudflareDashboardEnv(): { oauth: OAuthEnvSource; engine: EngineEnvSource } {
  return {
    oauth: cloudflareOAuthEnv(),
    engine: cloudflareEngineEnv(),
  };
}