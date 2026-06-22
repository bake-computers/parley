import { createFileRoute } from "@tanstack/react-router";
import { cloudflareOAuthEnv } from "#/lib/discord-oauth-cloudflare";
import { handleDiscordCallback } from "#/lib/discord-oauth-handlers";

export const Route = createFileRoute("/auth/discord/callback")({
  server: {
    handlers: {
      GET: ({ request }) => handleDiscordCallback(request, cloudflareOAuthEnv()),
    },
  },
});