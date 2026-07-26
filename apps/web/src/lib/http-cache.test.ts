import { describe, expect, test } from "vitest";
import { privateNoStore, publicCache } from "./http-cache";

describe("http-cache", () => {
  test("publicCache sets max-age, swr, and optional tags", () => {
    expect(publicCache(300, 3600)).toEqual({
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    });
    expect(publicCache(60, 600, "page:match")).toEqual({
      "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
      "Cache-Tag": "page:match",
    });
  });

  test("privateNoStore never stores", () => {
    expect(privateNoStore["Cache-Control"]).toBe("private, no-store");
  });
});
