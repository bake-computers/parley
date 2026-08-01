import type { EngineTransportEnv } from "./transport.js";

export type EngineEnvSource = EngineTransportEnv;

export function engineEnvFromCloudflare(env: EngineEnvSource): EngineTransportEnv {
  return {
    VPC_SERVICE: env.VPC_SERVICE,
    ENGINE_INTERNAL_URL: env.ENGINE_INTERNAL_URL,
    ENGINE_SHARED_SECRET: env.ENGINE_SHARED_SECRET,
  };
}
