import type { EngineTransportEnv } from "./engine-transport.js";

export type EngineEnvSource = EngineTransportEnv;

export function engineEnvFromCloudflare(env: EngineEnvSource): EngineTransportEnv {
  return {
    VPC_SERVICE: env.VPC_SERVICE,
    ENGINE_INTERNAL_URL: env.ENGINE_INTERNAL_URL,
    ENGINE_SERVICE_URL: env.ENGINE_SERVICE_URL,
    USE_LOCAL_ENGINE: env.USE_LOCAL_ENGINE,
  };
}