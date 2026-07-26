import type { DiscordOAuthEnv } from "./oauth.js";

export type OAuthEnvSource = {
  DISCORD_APPLICATION_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  AUTH_SECRET?: string;
  DISCORD_OAUTH_REDIRECT_ORIGIN?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_TOKEN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export function resolveBotToken(source: OAuthEnvSource): string | undefined {
  const fromBinding = source.DISCORD_BOT_TOKEN ?? source.DISCORD_TOKEN;
  if (fromBinding) {
    return fromBinding;
  }
  if (typeof process !== "undefined") {
    return process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN;
  }
  return undefined;
}

export function oauthEnvFromSource(source: OAuthEnvSource): DiscordOAuthEnv | null {
  const clientId = source.DISCORD_APPLICATION_ID;
  const clientSecret = source.DISCORD_CLIENT_SECRET;
  const authSecret = source.AUTH_SECRET;
  if (!clientId || !clientSecret || !authSecret) {
    return null;
  }
  return {
    DISCORD_APPLICATION_ID: clientId,
    DISCORD_CLIENT_SECRET: clientSecret,
    AUTH_SECRET: authSecret,
    DISCORD_OAUTH_REDIRECT_ORIGIN: source.DISCORD_OAUTH_REDIRECT_ORIGIN,
  };
}
