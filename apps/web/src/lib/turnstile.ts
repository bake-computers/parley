const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare dummy keys — always pass; work on localhost without a production widget. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

export function turnstileEnabled(siteKey?: string, secret?: string): boolean {
  return Boolean(siteKey && secret);
}

export async function verifyTurnstileToken(
  secret: string,
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) {
    body.append("remoteip", remoteIp);
  }

  const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
  if (!res.ok) {
    return false;
  }

  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
