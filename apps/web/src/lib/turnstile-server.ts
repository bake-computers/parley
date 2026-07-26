import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

export const getTurnstileSiteKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => env.TURNSTILE_SITE_KEY ?? "",
);
