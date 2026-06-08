import { describe, expect, test } from "bun:test";
import { resolveAxiomConfig, resolveAxiomIngestUrl } from "../config.js";
import { AxiomLogger } from "../logger.js";

describe("resolveAxiomIngestUrl", () => {
  test("uses legacy US API by default", () => {
    expect(resolveAxiomIngestUrl({ dataset: "parley" })).toBe(
      "https://api.axiom.co/v1/datasets/parley/ingest",
    );
  });

  test("uses edge domain for regional datasets", () => {
    expect(
      resolveAxiomIngestUrl({
        dataset: "parley",
        edge: "eu-central-1.aws.edge.axiom.co",
      }),
    ).toBe("https://eu-central-1.aws.edge.axiom.co/v1/ingest/parley");
  });

  test("strips quotes from dev var values", () => {
    const config = resolveAxiomConfig(
      {
        AXIOM_TOKEN: '"test-token"',
        AXIOM_EDGE: '"eu-central-1.aws.edge.axiom.co"',
        AXIOM_DATASET: '"parley"',
      },
      "bridge",
    );

    expect(config.ingestUrl).toBe("https://eu-central-1.aws.edge.axiom.co/v1/ingest/parley");
  });
});

describe("AxiomLogger", () => {
  test("falls back to console when token is missing", () => {
    const config = resolveAxiomConfig({}, "bridge");
    const logger = new AxiomLogger(config);

    expect(logger.configured).toBe(false);
    expect(logger.service).toBe("bridge");
    logger.logInfo("hello", { metric: "elo" });
  });

  test("queues events when configured", () => {
    const config = resolveAxiomConfig(
      {
        AXIOM_TOKEN: "test-token",
        AXIOM_DATASET: "parley-workers",
        SERVICE_NAME: "worker",
      },
      "worker",
    );
    const logger = new AxiomLogger(config);

    expect(logger.configured).toBe(true);
    logger.logHttp({
      method: "GET",
      path: "/health",
      status: 200,
      duration_ms: 1.2,
    });
  });
});
