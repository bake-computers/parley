import { describe, expect, test } from "bun:test";
import { buildTournamentCreateCard } from "#/interactions/tournament/slash";
import { buildTournamentQrSvg, createTournamentQrUrl } from "#/interactions/tournament/qr";
import { presignR2Object, type R2S3Config, type R2S3Fetch } from "#/interactions/tournament/r2-s3";

const TARGET_URL =
  "https://parley.bot/tournaments/create?handoff=signature.payload&source=discord%20server";

const STORAGE_ENV = {
  PARLEY_R2_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
  PARLEY_R2_ACCESS_KEY_ID: "test-access-key",
  PARLEY_R2_SECRET_ACCESS_KEY: "test-secret-key",
};

describe("tournament QR", () => {
  test("renders a branded high-correction QR as SVG", () => {
    const svg = buildTournamentQrSvg(TARGET_URL);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('fill="#3b3b3b"');
    expect(svg).toContain("data:image/png;base64,");
    expect(svg).toContain('rx="1.35"');
    expect(svg).not.toContain("quickchart.io");
  });

  test("renders the signed object URL as the thumbnail", () => {
    const qrUrl =
      "https://account-id.r2.cloudflarestorage.com/parley/qr/qr-id.svg?X-Amz-Expires=86400";
    const card = buildTournamentCreateCard(TARGET_URL, qrUrl).toJSON();
    const json = JSON.stringify(card);

    expect(json).toContain('"type":9');
    expect(json).toContain('"type":11');
    expect(json).toContain("Scan to create a tournament");
    expect(json).toContain("Scan the QR code");
    expect(json).toContain("https://account-id.r2.cloudflarestorage.com/parley/qr/qr-id.svg");
    expect(json).not.toContain("cdn.parley.bot/qr/");
    expect(json).not.toContain("quickchart.io");
  });

  test("matches Bun S3's R2 presign contract", async () => {
    const config: R2S3Config = {
      endpoint: STORAGE_ENV.PARLEY_R2_ENDPOINT,
      accessKeyId: STORAGE_ENV.PARLEY_R2_ACCESS_KEY_ID,
      secretAccessKey: STORAGE_ENV.PARLEY_R2_SECRET_ACCESS_KEY,
      bucket: "parley",
    };

    await expect(
      presignR2Object(config, "qr/test.svg", {
        expiresIn: 86400,
        responseContentType: "image/svg+xml",
        now: new Date("2026-08-05T14:00:00.000Z"),
      }),
    ).resolves.toBe(
      "https://account-id.r2.cloudflarestorage.com/parley/qr/test.svg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=test-access-key%2F20260805%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20260805T140000Z&X-Amz-Expires=86400&X-Amz-Signature=673325788941ac8f7208f512659ce2f177cc778bf5edba675a3089f4652ce1ff&X-Amz-SignedHeaders=host&response-content-type=image%2Fsvg%2Bxml",
    );
  });

  test("stores generated QR objects below qr and returns a one-day signed URL", async () => {
    const requests: { input: string | URL | Request; init?: RequestInit }[] = [];
    const fetchImpl: R2S3Fetch = (input, init) => {
      requests.push({ input, ...(init ? { init } : {}) });
      return Promise.resolve(new Response(null, { status: 200 }));
    };

    const url = await createTournamentQrUrl(TARGET_URL, STORAGE_ENV, {
      fetchImpl,
      now: new Date("2026-08-05T14:00:00.000Z"),
    });
    const signedUrl = new URL(url);
    const upload = requests[0];

    expect(signedUrl.origin).toBe(STORAGE_ENV.PARLEY_R2_ENDPOINT);
    expect(signedUrl.pathname).toMatch(/^\/parley\/qr\/[0-9a-f-]+\.svg$/u);
    expect(signedUrl.searchParams.get("X-Amz-Expires")).toBe("86400");
    expect(signedUrl.searchParams.get("response-content-type")).toBe("image/svg+xml");
    expect(upload?.input.toString()).toMatch(
      /^https:\/\/account-id\.r2\.cloudflarestorage\.com\/parley\/qr\/[0-9a-f-]+\.svg\?/u,
    );
    expect(upload?.init?.method).toBe("PUT");
    expect(upload?.init?.headers).toEqual({
      "cache-control": "public, max-age=86400, immutable",
      "content-type": "image/svg+xml",
    });
  });
});
