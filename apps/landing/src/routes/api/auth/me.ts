import { createFileRoute } from "@tanstack/react-router";
import { cloudflareOAuthEnv } from "#/lib/discord/cloudflare";
import { handleDiscordMe } from "#/lib/discord/handlers";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: ({ request }) => handleDiscordMe(request, cloudflareOAuthEnv()),
    },
  },
});
