import { afterEach, describe, expect, test } from "bun:test";
import { logger, setLogSinkForTests, type LogRecord } from "../src/logger";

describe("logger", () => {
  afterEach(() => {
    setLogSinkForTests(null);
  });

  test("serializes errors without throwing", () => {
    const records: LogRecord[] = [];
    setLogSinkForTests((record) => records.push(record));

    expect(() =>
      logger.error("test.error", "Test error", {
        error: new Error("boom"),
      }),
    ).not.toThrow();

    expect(records).toHaveLength(1);
    expect(records[0]?.error).toMatchObject({
      name: "Error",
      message: "boom",
    });
  });
});
