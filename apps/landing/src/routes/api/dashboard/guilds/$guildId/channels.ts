import { createFileRoute } from "@tanstack/react-router";
import { cloudflareDashboardEnv } from "#/lib/cloudflare/env";

export const Route = createFileRoute("/api/dashboard/guilds/$guildId/channels")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { oauth } = cloudflareDashboardEnv();
        const { handleGetGuildChannels } = await import("#/lib/dashboard/guild/handlers");
        return handleGetGuildChannels(request, oauth);
      },
    },
  },
});
