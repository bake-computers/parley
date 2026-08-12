/**
 * Thin augmentation of the generated `Cloudflare.Env`
 * (apps/web/worker-configuration.d.ts, produced by `wrangler types`).
 *
 * Only declare bindings the generated types cannot see: secrets from
 * `.dev.vars` / `wrangler secret put` (wrangler only sees vars, and a local
 * `.dev.vars` may not exist at typegen time), plus env-local vars. Keep in
 * sync with `.dev.vars.example`; do not duplicate generated bindings here.
 */
declare namespace Cloudflare {
  interface Env {
    /** Shared engine auth secret; set via .dev.vars / `wrangler secret put`. */
    ENGINE_SHARED_SECRET?: string;
    /** Discord OAuth client secret. */
    DISCORD_CLIENT_SECRET?: string;
    /** Session cookie signing secret. */
    AUTH_SECRET?: string;
    /** Same bot token as apps/worker ("Ready" vs "Add Parley" on /dashboard). */
    DISCORD_BOT_TOKEN?: string;
    /** Legacy alias for DISCORD_BOT_TOKEN (runtime fallback). */
    DISCORD_TOKEN?: string;
    DISCORD_OAUTH_REDIRECT_ORIGIN?: string;
    /** Cloudflare Turnstile verification secret. */
    TURNSTILE_SECRET_KEY?: string;
    /** Tournament create-handoff HMAC secret (shared with apps/worker). */
    TOURNAMENT_HANDOFF_SECRET?: string;
  }
}
