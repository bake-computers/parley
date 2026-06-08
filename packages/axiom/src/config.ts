export interface AxiomEnv {
  AXIOM_TOKEN?: string;
  AXIOM_DATASET?: string;
  AXIOM_ORG_ID?: string;
  AXIOM_EDGE?: string;
  AXIOM_EDGE_URL?: string;
  AXIOM_ENABLED?: string;
  SERVICE_NAME?: string;
}

export interface AxiomConfig {
  token: string | undefined;
  dataset: string;
  orgId: string | undefined;
  edge: string | undefined;
  edgeUrl: string | undefined;
  ingestUrl: string;
  enabled: boolean;
  service: string;
}

function trimOptional(value: string | undefined): string | undefined {
  let trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveAxiomIngestUrl(options: {
  dataset: string;
  edge?: string | undefined;
  edgeUrl?: string | undefined;
}): string {
  const edgeUrl = trimOptional(options.edgeUrl);
  if (edgeUrl) {
    return `${edgeUrl.replace(/\/$/, "")}/v1/ingest/${options.dataset}`;
  }

  const edge = trimOptional(options.edge);
  if (edge) {
    const base =
      edge.startsWith("http://") || edge.startsWith("https://") ? edge : `https://${edge}`;
    return `${base.replace(/\/$/, "")}/v1/ingest/${options.dataset}`;
  }

  return `https://api.axiom.co/v1/datasets/${options.dataset}/ingest`;
}

export function resolveAxiomConfig(env: AxiomEnv, fallbackService: string): AxiomConfig {
  const token = trimOptional(env.AXIOM_TOKEN);
  const enabled = env.AXIOM_ENABLED !== "false";
  const dataset = trimOptional(env.AXIOM_DATASET) ?? "parley";
  const edge = trimOptional(env.AXIOM_EDGE);
  const edgeUrl = trimOptional(env.AXIOM_EDGE_URL);

  return {
    token,
    dataset,
    orgId: trimOptional(env.AXIOM_ORG_ID),
    edge,
    edgeUrl,
    ingestUrl: resolveAxiomIngestUrl({ dataset, edge, edgeUrl }),
    enabled,
    service: env.SERVICE_NAME?.trim() || fallbackService,
  };
}

export function isAxiomConfigured(config: AxiomConfig): boolean {
  return config.enabled && config.token !== undefined;
}
