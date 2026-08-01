declare namespace Cloudflare {
  interface Env {
    DISCORD_APPLICATION_ID: string;
    DISCORD_CLIENT_SECRET: string;
    DISCORD_BOT_TOKEN?: string;
    DISCORD_TOKEN?: string;
    AUTH_SECRET: string;
    TOURNAMENT_HANDOFF_SECRET?: string;
    DISCORD_OAUTH_REDIRECT_ORIGIN?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    VPC_SERVICE?: Fetcher;
    ENGINE_INTERNAL_URL?: string;
    ENGINE_SHARED_SECRET?: string;
  }
}

interface Env extends Cloudflare.Env {}
