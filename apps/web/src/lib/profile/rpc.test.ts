import { describe, expect, it } from "vitest";
import { asNumber } from "./rpc";
import { serializeJsonLd } from "./head";

describe("asNumber", () => {
  it("keeps finite numbers", () => {
    expect(asNumber(42)).toBe(42);
    expect(asNumber(0)).toBe(0);
  });

  it("parses protojson int64 decimal strings", () => {
    expect(asNumber("1700000000000")).toBe(1700000000000);
    expect(asNumber("-12.5")).toBe(-12.5);
  });

  it("falls back for garbage", () => {
    expect(asNumber(undefined, 7)).toBe(7);
    expect(asNumber("nope", 3)).toBe(3);
    expect(asNumber(Number.NaN, 1)).toBe(1);
  });
});

describe("serializeJsonLd", () => {
  it("escapes angle brackets so user strings cannot break script tags", () => {
    const payload = serializeJsonLd({
      name: "</script><script>alert(1)</script>",
    });
    expect(payload).not.toContain("</script>");
    expect(payload).toContain("\\u003c/script>");
  });
});
