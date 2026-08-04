const QUICKCHART_QR_URL = "https://quickchart.io/qr";
const PARLEY_QR_LOGO_URL = "https://parley.bot/favicon-96x96.png";

export function buildTournamentQrUrl(targetUrl: string): string {
  const qrUrl = new URL(QUICKCHART_QR_URL);
  qrUrl.searchParams.set("text", targetUrl);
  qrUrl.searchParams.set("format", "png");
  qrUrl.searchParams.set("size", "240");
  qrUrl.searchParams.set("margin", "1");
  qrUrl.searchParams.set("ecLevel", "H");
  qrUrl.searchParams.set("dark", "000000");
  qrUrl.searchParams.set("light", "FFFFFF");
  qrUrl.searchParams.set("centerImageUrl", PARLEY_QR_LOGO_URL);
  qrUrl.searchParams.set("centerImageSizeRatio", "0.18");
  return qrUrl.toString();
}
