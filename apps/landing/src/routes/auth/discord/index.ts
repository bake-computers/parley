import { createFileRoute } from "@tanstack/react-router";
import { cloudflareOAuthEnv } from "#/lib/discord-oauth-cloudflare";
import { handleDiscordLogin } from "#/lib/discord-oauth-handlers";

export const Route = createFileRoute("/auth/discord/")({
  server: {
    handlers: {
      GET: ({ request }) => handleDiscordLogin(request, cloudflareOAuthEnv()),
    },
  },
});