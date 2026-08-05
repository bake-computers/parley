import { describe, expect, test } from "bun:test";
import type { R2Bucket } from "@cloudflare/workers-types";
import { buildTournamentCreateCard } from "#/interactions/tournament/slash";
import {
  buildTournamentQrSvg,
  buildTournamentQrUrl,
  createTournamentQrUrl,
  serveTournamentQr,
} from "#/interactions/tournament/qr";

const TARGET_URL =
  "https://parley.bot/tournaments/create?handoff=signature.payload&source=discord%20server";

describe("tournament QR", () => {
  test("renders a branded high-correction QR as SVG", () => {
    const svg = buildTournamentQrSvg(TARGET_URL);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('fill="#3b3b3b"');
    expect(svg).toContain("data:image/png;base64,");
    expect(svg).toContain('rx="1.35"');
    expect(svg).not.toContain("quickchart.io");
  });

  test("renders the CDN URL as the thumbnail", () => {
    const qrUrl = buildTournamentQrUrl("qr-id.svg");
    const card = buildTournamentCreateCard(TARGET_URL, qrUrl).toJSON();
    const json = JSON.stringify(card);

    expect(json).toContain('"type":9');
    expect(json).toContain('"type":11');
    expect(json).toContain("Scan to create a tournament");
    expect(json).toContain("Scan the QR code");
    expect(json).toContain("https://cdn.parley.bot/qr/qr-id.svg");
    expect(json).not.toContain("quickchart.io");
  });

  test("stores generated QR objects below the qr prefix", async () => {
    const puts: { key: string; value: string; options?: unknown }[] = [];
    const bucket = {
      put: (key: string, value: string, options?: unknown) => {
        puts.push({ key, value, options });
        return Promise.resolve({});
      },
    } as unknown as R2Bucket;

    const url = await createTournamentQrUrl(TARGET_URL, bucket);

    expect(url).toMatch(/^https:\/\/cdn\.parley\.bot\/qr\/[0-9a-f-]+\.svg$/u);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toMatch(/^qr\/[0-9a-f-]+\.svg$/u);
    expect(puts[0]?.value).toContain("<svg");
    expect(puts[0]?.options).toEqual({
      httpMetadata: {
        contentType: "image/svg+xml",
        cacheControl: "public, max-age=86400, immutable",
        cacheExpiry: expect.any(Date),
      },
    });
  });

  test("only serves generated QR object names", async () => {
    const object = {
      body: new Response("svg").body,
      httpEtag: '"qr-etag"',
      writeHttpMetadata(headers: Headers) {
        headers.set("content-type", "image/svg+xml");
      },
    };
    const keys: string[] = [];
    const bucket = {
      get: (key: string) => {
        keys.push(key);
        return Promise.resolve(object);
      },
    } as unknown as R2Bucket;

    const missing = await serveTournamentQr(bucket, "not-a-qr.svg");
    expect(missing.status).toBe(404);
    expect(keys).toEqual([]);

    const response = await serveTournamentQr(bucket, "123e4567-e89b-12d3-a456-426614174000.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400, immutable");
    expect(response.headers.get("etag")).toBe('"qr-etag"');
    expect(keys).toEqual(["qr/123e4567-e89b-12d3-a456-426614174000.svg"]);
  });
});
