import { encodeQR } from "qr";
import { presignR2Object, putR2Object, type R2S3Fetch, type R2S3Config } from "./r2-s3";

const QR_PREFIX = "qr/";
const QR_EXTENSION = ".svg";
const QR_BUCKET = "parley";
const QR_URL_SECONDS = 24 * 60 * 60;
const QR_CACHE_CONTROL = "public, max-age=86400, immutable";
const QUIET_ZONE = 4;
const FINDER_SIZE = 7;
const DARK = "#3b3b3b";
const LOGO_DATA_URI =
  "data:image/png;base64,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DgAA9ly/J/OLp37xwLvf857nRoeHo3u2XjXws6eeXTlHXKDGB8+4aDzhtCl7n8wcH8C4CD6gD2H540tE9KqI8P4n9l8q9pTocqWPi9LOnTuBebUgIiV1LauCdEOzV5hGDCJCdnoyM3b2ZKTQWXShLDgH4EEC7gbRUwCyTzxx8U3NYnTZ36a6EhJhmhjuV9FEwkViCVNYjQsoeyfMBYhSANABQD5PhB8CPMGs8fOfP/lrbdtvBAAAEORzemJ4wNa3tDMppYQhQT7rimboPJywgHAEwNcJ+CaTPaVYy5O/eOqytOuKA6CyQyUAQtMT4zqWSLloPC6TYyOcmRh3tGAB60o3Ld1mBMC9JPT3EBwSEvfUL565rO294gAokFTadc6qscE+p7Tm3EzGEEF5xltW+gnIgPAYBHeD6FERmWZi/PKpy8t84MoF4DCA+xG+2nxOWSOfy5aWOw6XDFgyAnIAXgLhcxC6NxJxw9msxvwV1S8nXakAHAfwxwAeQOGViCISmX+SCBX6l+eqQFiYoJMA/gmErznHh5Ui2f/4c5e7XQvoigtDi7R9+3YwM5RSbQB+B+E7iNehrOytiKa0VlECzKyZxwSA+0D0WQGeBxA8++yVx/giXbEAFGn79u1A2HNXfJvTB1F4mxMRTWlFRQCyBPwSoC+A8CCBJp0wnn/+wOVuwpJ0xQNQpAIQEQDXA/ikCO5QBE8p0hT6jC+C6HsO1KcgVzzji/QbAwAAbNmypbBMpVQDuJMId+mwVPyPIHoFAD9/4ODlfszzot8oAIq0bds2SLjAQDURsgCyB5cZfXCl0v8Ddzy8nnrE1T4AAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDYtMDZUMTU6NTA6NDUrMDA6MDCXJYH/AAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA2LTA2VDE1OjUwOjQ1KzAwOjAw5ng5QwAAACB0RVh0c29mdHdhcmUAaHR0cHM6Ly9pbWFnZW1hZ2ljay5vcme8zx2dAAAAGHRFWHRUaHVtYjo6RG9jdW1lbnQ6OlBhZ2VzADGn/7svAAAAGHRFWHRUaHVtYjo6SW1hZ2U6OkhlaWdodAAxOTJAXXFVAAAAF3RFWHRUaHVtYjo6SW1hZ2U6OldpZHRoADE5MtOsIQgAAAAZdEVYdFRodW1iOjpNaW1ldHlwZQBpbWFnZS9wbmc/slZOAAAAF3RFWHRUaHVtYjo6TVRpbWUAMTc4MDc2MTA0Nfhu42MAAAAPdEVYdFRodW1iOjpTaXplADBCQpSiPuwAAABWdEVYdFRodW1iOjpVUkkAZmlsZTovLy9tbnRsb2cvZmF2aWNvbnMvMjAyNi0wNi0wNi84NzM1NGUwMjBkNzI5MDkxZDYwZmY5NDU0Y2I2YTM4OC5pY28ucG5ndtQEuwAAAABJRU5ErkJggg==";
type QrMatrix = readonly (readonly boolean[])[];

export type TournamentQrStorageEnv = {
  PARLEY_R2_ENDPOINT?: string;
  PARLEY_R2_ACCESS_KEY_ID?: string;
  PARLEY_R2_SECRET_ACCESS_KEY?: string;
};

export type TournamentQrOptions = {
  fetchImpl?: R2S3Fetch;
  now?: Date;
};

function requiredEnvValue(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is not configured`);
  }
  return value.trim();
}

function qrStorageConfig(env: TournamentQrStorageEnv): R2S3Config {
  return {
    endpoint: requiredEnvValue(env.PARLEY_R2_ENDPOINT, "PARLEY_R2_ENDPOINT"),
    accessKeyId: requiredEnvValue(env.PARLEY_R2_ACCESS_KEY_ID, "PARLEY_R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvValue(
      env.PARLEY_R2_SECRET_ACCESS_KEY,
      "PARLEY_R2_SECRET_ACCESS_KEY",
    ),
    bucket: QR_BUCKET,
  };
}

export function hasTournamentQrStorage(env: TournamentQrStorageEnv): boolean {
  return Boolean(
    env.PARLEY_R2_ENDPOINT?.trim() &&
    env.PARLEY_R2_ACCESS_KEY_ID?.trim() &&
    env.PARLEY_R2_SECRET_ACCESS_KEY?.trim(),
  );
}

function finderStarts(size: number): readonly [number, number][] {
  const last = size - QUIET_ZONE - FINDER_SIZE;
  return [
    [QUIET_ZONE, QUIET_ZONE],
    [last, QUIET_ZONE],
    [QUIET_ZONE, last],
  ];
}

function isFinderModule(x: number, y: number, size: number): boolean {
  return finderStarts(size).some(
    ([startX, startY]) =>
      x >= startX && x < startX + FINDER_SIZE && y >= startY && y < startY + FINDER_SIZE,
  );
}

function finderMarkup(x: number, y: number): string {
  return [
    `<rect x="${x}" y="${y}" width="7" height="7" rx="1.35"/>`,
    `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="0.85" fill="white"/>`,
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.65"/>`,
  ].join("");
}

function moduleMarkup(matrix: QrMatrix): string {
  const size = matrix.length;
  const modules: string[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix[y]?.[x] && !isFinderModule(x, y, size)) {
        modules.push(
          `<rect x="${x + 0.08}" y="${y + 0.08}" width="0.84" height="0.84" rx="0.26"/>`,
        );
      }
    }
  }

  for (const [x, y] of finderStarts(size)) {
    modules.push(finderMarkup(x, y));
  }

  return modules.join("");
}

function logoMarkup(size: number): string {
  const logoSize = Math.max(9, Math.min(13, Math.floor((size - QUIET_ZONE * 2) * 0.22)));
  const x = (size - logoSize) / 2;
  const padding = 1.15;

  return [
    `<rect x="${x}" y="${x}" width="${logoSize}" height="${logoSize}" rx="1.4" fill="white"/>`,
    `<image href="${LOGO_DATA_URI}" x="${x + padding}" y="${x + padding}" width="${logoSize - padding * 2}" height="${logoSize - padding * 2}" preserveAspectRatio="xMidYMid meet"/>`,
  ].join("");
}

export function buildTournamentQrSvg(targetUrl: string): string {
  const matrix = encodeQR(targetUrl, "raw", {
    ecc: "high",
    border: QUIET_ZONE,
  });
  const size = matrix.length;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="512" height="512" role="img" aria-label="Parley tournament creation QR code" shape-rendering="geometricPrecision">`,
    `<title>Parley tournament creation QR code</title>`,
    `<rect width="${size}" height="${size}" fill="white"/>`,
    `<g fill="${DARK}">${moduleMarkup(matrix)}</g>`,
    logoMarkup(size),
    `</svg>`,
  ].join("");
}

export async function createTournamentQrUrl(
  targetUrl: string,
  env: TournamentQrStorageEnv,
  options: TournamentQrOptions = {},
): Promise<string> {
  const config = qrStorageConfig(env);
  const objectName = `${QR_PREFIX}${crypto.randomUUID()}${QR_EXTENSION}`;
  const svg = buildTournamentQrSvg(targetUrl);

  const putOptions = {
    contentType: "image/svg+xml",
    cacheControl: QR_CACHE_CONTROL,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.now ? { now: options.now } : {}),
  };
  await putR2Object(config, objectName, svg, putOptions);

  const presignOptions = {
    expiresIn: QR_URL_SECONDS,
    responseContentType: "image/svg+xml",
    ...(options.now ? { now: options.now } : {}),
  };
  return presignR2Object(config, objectName, presignOptions);
}
