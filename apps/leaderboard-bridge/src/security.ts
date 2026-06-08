const DEFAULT_CONNECT_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const connectionLog = new Map<string, number[]>();

export function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function isOriginAllowed(origin: string | null | undefined, allowed: string[]): boolean {
  if (origin === null || origin === undefined || origin.length === 0) {
    return allowed.length === 0;
  }
  return allowed.includes(origin);
}

export function corsHeaders(origin: string | null, allowed: string[]): HeadersInit | undefined {
  if (origin === null || !isOriginAllowed(origin, allowed)) {
    return undefined;
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function checkConnectionRateLimit(
  ip: string,
  limit = DEFAULT_CONNECT_LIMIT,
  now = Date.now(),
): boolean {
  const recent = (connectionLog.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_WINDOW_MS,
  );
  if (recent.length >= limit) {
    connectionLog.set(ip, recent);
    return false;
  }
  recent.push(now);
  connectionLog.set(ip, recent);
  return true;
}

export function resetConnectionRateLimits(): void {
  connectionLog.clear();
}
