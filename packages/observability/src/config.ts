export interface PipelineEnv {
  /** Production-only pipelines binding; absent locally and in dev. */
  STREAM?: { send(records: unknown[]): Promise<void> };
  SERVICE_NAME?: string;
}

export interface PipelineConfig {
  stream: { send(records: unknown[]): Promise<void> } | undefined;
  service: string;
}

export function resolvePipelineConfig(
  env: PipelineEnv,
  fallbackService: string,
): PipelineConfig {
  return {
    stream: env.STREAM,
    service: env.SERVICE_NAME?.trim() || fallbackService,
  };
}

export function isPipelineConfigured(config: PipelineConfig): boolean {
  return config.stream !== undefined;
}
