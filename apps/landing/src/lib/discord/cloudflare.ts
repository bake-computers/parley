import { env } from "cloudflare:workers";
import type { OAuthEnvSource } from "./env.js";

export function cloudflareOAuthEnv(): OAuthEnvSource {
  return {
    DISCORD_APPLICATION_ID: env.DISCORD_APPLICATION_ID,
    DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET,
    AUTH_SECRET: env.AUTH_SECRET,
    DISCORD_OAUTH_REDIRECT_ORIGIN: env.DISCORD_OAUTH_REDIRECT_ORIGIN,
  };
}