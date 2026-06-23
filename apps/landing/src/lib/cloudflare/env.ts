import { env } from "cloudflare:workers";
import { cloudflareOAuthEnv } from "../discord/cloudflare.js";
import type { OAuthEnvSource } from "../discord/env.js";
import type { EngineEnvSource } from "../engine/env.js";

export function cloudflareEngineEnv(): EngineEnvSource {
  return {
    VPC_SERVICE: env.VPC_SERVICE as EngineEnvSource["VPC_SERVICE"],
    ENGINE_INTERNAL_URL: env.ENGINE_INTERNAL_URL,
  };
}

export function cloudflareDashboardEnv(): { oauth: OAuthEnvSource; engine: EngineEnvSource } {
  return {
    oauth: cloudflareOAuthEnv(),
    engine: cloudflareEngineEnv(),
  };
}