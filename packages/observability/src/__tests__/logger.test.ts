import { afterEach, describe, expect, test, vi } from "bun:test";
import { resolvePipelineConfig } from "#/config";
import { EventLogger } from "#/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

function configuredLogger(service = "worker") {
  const stream = { send: vi.fn(async () => {}) };
  const logger = new EventLogger(
    resolvePipelineConfig({ STREAM: stream, SERVICE_NAME: service }, "worker"),
  );
  return { logger, stream };
}

describe("EventLogger", () => {
  test("no binding => unconfigured, finish() console.logs one wide event, flush() never sends", async () => {
    const logger = new EventLogger(resolvePipelineConfig({}, "bridge"));

    expect(logger.configured).toBe(false);
    expect(logger.service).toBe("bridge");

    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.begin({ request_id: "req-1", http: { method: "GET", path: "/health" } });
    logger.merge({ http: { status: 200 }, duration_ms: 1.2 });
    logger.finish();
    expect(logged).toHaveBeenCalledTimes(1);

    await logger.flush();

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

  test("binding present => finish+flush sends exactly one event via stream.send", async () => {
    const { logger, stream } = configuredLogger();

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

    await logger.flush();

    expect(stream.send).toHaveBeenCalledTimes(1);
    const events = stream.send.mock.calls[0]?.[0] as unknown[];
    expect(events).toHaveLength(1);
    const event = events[0] as Record<string, unknown>;
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
  });

  test("flush() with no pending events does not call stream.send", async () => {
    const { logger, stream } = configuredLogger();
    await logger.flush();
    expect(stream.send).not.toHaveBeenCalled();
  });

  test("error outcome drives error level and message", async () => {
    const { logger, stream } = configuredLogger();
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

    await logger.flush();
    const events = stream.send.mock.calls[0]?.[0] as unknown[];

    expect(events).toHaveLength(1);
    const event = events[0] as Record<string, unknown>;
    expect(event.level).toBe("error");
    expect(event.outcome).toBe("error");
    expect(event.message).toBe("slash unlink failed: unlinkAccount RPC failed");
    expect(event.error).toMatchObject({ message: "unlinkAccount RPC failed" });
  });

  test("emitStandalone queues a full record without begin", async () => {
    const { logger, stream } = configuredLogger();
    logger.emitStandalone({
      event: "startup",
      message: "worker booted",
      where: "worker startup",
    });

    await logger.flush();
    const events = stream.send.mock.calls[0]?.[0] as unknown[];

    expect(events).toHaveLength(1);
    const event = events[0] as Record<string, unknown>;
    expect(event.event).toBe("startup");
    expect(event.message).toBe("worker booted");
    expect(event.service).toBe("worker");
  });
});
