import type { DiscordOAuthEnv } from "./oauth.js";

export type OAuthEnvSource = {
  DISCORD_APPLICATION_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  AUTH_SECRET?: string;
  DISCORD_OAUTH_REDIRECT_ORIGIN?: string;
};

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