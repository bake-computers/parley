import { createFileRoute } from "@tanstack/react-router";
import { cloudflareOAuthEnv } from "#/lib/discord/cloudflare";
import { handleDiscordLogin } from "#/lib/discord/handlers";

export const Route = createFileRoute("/auth/discord/")({
  server: {
    handlers: {
      GET: ({ request }) => handleDiscordLogin(request, cloudflareOAuthEnv()),
      POST: ({ request }) => handleDiscordLogin(request, cloudflareOAuthEnv()),
    },
  },
});
