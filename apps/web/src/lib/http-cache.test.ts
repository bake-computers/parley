import { describe, expect, test } from "vite-plus/test";
import { privateNoStore, publicCache } from "./http-cache";

describe("http-cache", () => {
  test("publicCache caps max-age at 3600s, honors SWR, sets optional tags", () => {
    expect(publicCache(300, 3600)).toEqual({
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    });
    expect(publicCache(30, 600, "page:match")).toEqual({
      "Cache-Control": "public, max-age=30, stale-while-revalidate=600",
      "Cache-Tag": "page:match",
    });
    expect(publicCache(5000)).toEqual({
      "Cache-Control": "public, max-age=3600, must-revalidate",
    });
    expect(publicCache(0)).toEqual({
      "Cache-Control": "public, max-age=0, must-revalidate",
    });
  });

  test("privateNoStore never stores", () => {
    expect(privateNoStore["Cache-Control"]).toBe("private, no-store");
  });
});
