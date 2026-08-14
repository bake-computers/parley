import { afterEach, describe, expect, test, vi } from "bun:test";
import { resolveAxiomConfig, resolveAxiomIngestUrl } from "#/config";
import { AxiomLogger } from "#/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

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

function configuredLogger(service = "worker"): AxiomLogger {
  const config = resolveAxiomConfig(
    {
      AXIOM_TOKEN: "test-token",
      AXIOM_DATASET: "parley-workers",
      SERVICE_NAME: service,
    },
    "worker",
  );
  return new AxiomLogger(config);
}

describe("AxiomLogger", () => {
  test("falls back to console JSON when token is missing", () => {
    const config = resolveAxiomConfig({}, "bridge");
    const logger = new AxiomLogger(config);

    expect(logger.configured).toBe(false);
    expect(logger.service).toBe("bridge");

    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.begin({ request_id: "req-1", http: { method: "GET", path: "/health" } });
    logger.merge({ http: { status: 200 }, duration_ms: 1.2 });
    logger.finish();

    expect(logged).toHaveBeenCalledTimes(1);
    const event = JSON.parse(String(logged.mock.calls[0]?.[0]));
    expect(event.event).toBe("request.completed");
    expect(event.message).toBe("GET /health 200 (1.2ms)");
    expect(event.service).toBe("bridge");
    expect(event.request_id).toBe("req-1");
    expect(event.outcome).toBe("success");
    expect(event.http.status).toBe(200);
    expect(typeof event.ts).toBe("string");
    logged.mockRestore();
  });

  test("queues exactly one wide event when configured", async () => {
    const logger = configuredLogger();

    expect(logger.configured).toBe(true);
    logger.begin({
      request_id: "req-1",
      http: { method: "POST", path: "/interactions", user_agent: "DiscordBot" },
      env: { colo: "SFO", country: "US" },
    });
    logger.merge({
      message: "slash link completed",
      where: "worker slash link",
      discord: { surface: "slash", name: "link", interaction_id: "i-1", guild_id: "g-1" },
    });
    logger.merge({ http: { status: 200 }, duration_ms: 4.2 });
    logger.finish();
    logger.finish(); // idempotent

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await logger.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    const events = JSON.parse(String(body));
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.event).toBe("request.completed");
    expect(event.message).toBe("slash link completed");
    expect(event.service).toBe("worker");
    expect(event.request_id).toBe("req-1");
    expect(event.where).toBe("worker slash link");
    expect(event.http).toMatchObject({ method: "POST", path: "/interactions", status: 200 });
    expect(event.discord).toMatchObject({ surface: "slash", name: "link", interaction_id: "i-1" });
    expect(event.env).toMatchObject({ colo: "SFO", country: "US" });
    expect(event.outcome).toBe("success");
    expect(event.level).toBe("info");
    expect(event.duration_ms).toBe(4.2);
    fetchMock.mockRestore();
  });

  test("error outcome drives error level and message", async () => {
    const logger = configuredLogger();
    logger.begin({
      request_id: "req-2",
      http: { method: "POST", path: "/interactions" },
    });
    logger.merge({
      message: "slash unlink failed: unlinkAccount RPC failed",
      where: "worker slash unlink",
      discord: { surface: "slash", name: "unlink", interaction_id: "i-2" },
      outcome: "error",
      error: { type: "Error", message: "unlinkAccount RPC failed" },
    });
    logger.merge({ http: { status: 200 } });
    logger.finish();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await logger.flush();
    const events = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(events).toHaveLength(1);
    expect(events[0].level).toBe("error");
    expect(events[0].outcome).toBe("error");
    expect(events[0].message).toBe("slash unlink failed: unlinkAccount RPC failed");
    expect(events[0].error).toMatchObject({ message: "unlinkAccount RPC failed" });
    fetchMock.mockRestore();
  });

  test("emitStandalone queues a full record without begin", async () => {
    const logger = configuredLogger();
    logger.emitStandalone({
      event: "startup",
      message: "worker booted",
      where: "worker startup",
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await logger.flush();
    const events = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("startup");
    expect(events[0].message).toBe("worker booted");
    expect(events[0].service).toBe("worker");
    fetchMock.mockRestore();
  });
});
