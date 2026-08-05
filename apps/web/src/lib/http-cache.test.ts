import { describe, expect, test } from "vite-plus/test";
import { privateNoStore, publicCache } from "./http-cache";

describe("http-cache", () => {
  test("publicCache caps max-age, skips SWR, sets optional tags", () => {
    expect(publicCache(300, 3600)).toEqual({
      "Cache-Control": "public, max-age=60, must-revalidate",
    });
    expect(publicCache(30, 600, "page:match")).toEqual({
      "Cache-Control": "public, max-age=30, must-revalidate",
      "Cache-Tag": "page:match",
    });
  });

  test("privateNoStore never stores", () => {
    expect(privateNoStore["Cache-Control"]).toBe("private, no-store");
  });
});
