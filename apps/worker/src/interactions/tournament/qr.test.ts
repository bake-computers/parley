import { describe, expect, test } from "bun:test";
import { buildTournamentCreateCard } from "#/interactions/tournament/slash";
import { buildTournamentQrUrl } from "#/interactions/tournament/qr";

const TARGET_URL =
  "https://parley.bot/tournaments/create?handoff=signature.payload&source=discord%20server";

describe("tournament QR", () => {
  test("encodes the complete handoff URL and Parley branding", () => {
    const qrUrl = new URL(buildTournamentQrUrl(TARGET_URL));

    expect(qrUrl.origin).toBe("https://quickchart.io");
    expect(qrUrl.pathname).toBe("/qr");
    expect(qrUrl.searchParams.get("text")).toBe(TARGET_URL);
    expect(qrUrl.searchParams.get("ecLevel")).toBe("H");
    expect(qrUrl.searchParams.get("centerImageUrl")).toBe("https://parley.bot/favicon-96x96.png");
    expect(qrUrl.searchParams.get("centerImageSizeRatio")).toBe("0.18");
  });

  test("renders the QR as a compact Section thumbnail", () => {
    const card = buildTournamentCreateCard(TARGET_URL).toJSON();
    const json = JSON.stringify(card);

    expect(json).toContain('"type":9');
    expect(json).toContain('"type":11');
    expect(json).toContain("Scan to create a tournament");
    expect(json).toContain("Scan the QR code");
    expect(json).toContain("quickchart.io/qr");
  });
});
