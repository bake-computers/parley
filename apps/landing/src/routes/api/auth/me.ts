import { createFileRoute } from "@tanstack/react-router";
import { cloudflareOAuthEnv } from "#/lib/discord-oauth-cloudflare";
import { handleDiscordMe } from "#/lib/discord-oauth-handlers";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: ({ request }) => handleDiscordMe(request, cloudflareOAuthEnv()),
    },
  },
});