import { createFileRoute } from "@tanstack/react-router";
import { handleDiscordLogout } from "#/lib/discord-oauth-handlers";

export const Route = createFileRoute("/auth/logout")({
  server: {
    handlers: {
      GET: ({ request }) => handleDiscordLogout(request),
      POST: ({ request }) => handleDiscordLogout(request),
    },
  },
});