const textEncoder = new TextEncoder();
const S3_REGION = "auto";
const S3_SERVICE = "s3";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;
const UPLOAD_URL_SECONDS = 15 * 60;

export type R2S3Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export type R2S3PresignOptions = {
  method?: "GET" | "PUT";
  expiresIn?: number;
  responseContentType?: string;
  now?: Date;
};

export type R2S3Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type R2S3PutOptions = {
  contentType: string;
  cacheControl: string;
  fetchImpl?: R2S3Fetch;
  now?: Date;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encode(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(parameters: readonly (readonly [string, string])[]): string {
  return parameters
    .map(([name, value]) => [encode(name), encode(value)] as const)
    .toSorted(([leftName, leftValue], [rightName, rightValue]) => {
      if (leftName === rightName) {
        return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
      }
      return leftName < rightName ? -1 : 1;
    })
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

function canonicalObjectPath(bucket: string, key: string): string {
  return `/${[bucket, ...key.split("/")].map((segment) => encode(segment)).join("/")}`;
}

function endpointOrigin(endpoint: string): URL {
  const url = new URL(endpoint);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("PARLEY_R2_ENDPOINT must be an origin URL without a path or credentials");
  }
  return url;
}

function timestamp(now: Date): { shortDate: string; amzDate: string } {
  const iso = now.toISOString();
  return {
    shortDate: iso.slice(0, 10).replaceAll("-", ""),
    amzDate: `${iso.slice(0, 19).replaceAll("-", "").replaceAll(":", "")}Z`,
  };
}

function validateExpiry(expiresIn: number): void {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_PRESIGN_SECONDS) {
    throw new Error(`R2 presigned URL expiry must be between 1 and ${MAX_PRESIGN_SECONDS} seconds`);
  }
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)));
}

async function hmacSha256(key: ArrayBuffer, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(value));
}

export async function presignR2Object(
  config: R2S3Config,
  key: string,
  options: R2S3PresignOptions = {},
): Promise<string> {
  const method = options.method ?? "GET";
  const expiresIn = options.expiresIn ?? 24 * 60 * 60;
  validateExpiry(expiresIn);

  const origin = endpointOrigin(config.endpoint);
  const host = origin.host;
  const objectPath = canonicalObjectPath(config.bucket, key);
  const { shortDate, amzDate } = timestamp(options.now ?? new Date());
  const credentialScope = `${shortDate}/${S3_REGION}/${S3_SERVICE}/aws4_request`;
  const queryParameters: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresIn)],
    ["X-Amz-SignedHeaders", "host"],
  ];

  if (method === "GET" && options.responseContentType) {
    queryParameters.push(["response-content-type", options.responseContentType]);
  }

  const queryString = canonicalQuery(queryParameters);
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    method,
    objectPath,
    queryString,
    canonicalHeaders,
    "host",
    UNSIGNED_PAYLOAD,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const dateKey = await hmacSha256(
    toArrayBuffer(textEncoder.encode(`AWS4${config.secretAccessKey}`)),
    shortDate,
  );
  const regionKey = await hmacSha256(dateKey, S3_REGION);
  const serviceKey = await hmacSha256(regionKey, S3_SERVICE);
  const signingKey = await hmacSha256(serviceKey, "aws4_request");
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  const signedQuery = canonicalQuery([...queryParameters, ["X-Amz-Signature", signature]]);

  return `${origin.protocol}//${host}${objectPath}?${signedQuery}`;
}

export async function putR2Object(
  config: R2S3Config,
  key: string,
  body: string,
  options: R2S3PutOptions,
): Promise<void> {
  const presignOptions: R2S3PresignOptions = {
    method: "PUT",
    expiresIn: UPLOAD_URL_SECONDS,
  };
  if (options.now) {
    presignOptions.now = options.now;
  }

  const uploadUrl = await presignR2Object(config, key, presignOptions);
  const fetchImpl: R2S3Fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const response = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: {
      "cache-control": options.cacheControl,
      "content-type": options.contentType,
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`R2 upload failed with ${response.status}: ${detail.slice(0, 200)}`);
  }
}
