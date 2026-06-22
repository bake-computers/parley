import { createFileRoute } from "@tanstack/react-router";
import { cloudflareDashboardEnv } from "#/lib/cloudflare-env";

export const Route = createFileRoute("/api/dashboard/guilds/$guildId/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { oauth, engine } = cloudflareDashboardEnv();
        const { handleGetGuildSettingsBundle } = await import("#/lib/guild-settings-handlers");
        return handleGetGuildSettingsBundle(request, oauth, engine);
      },
      PATCH: async ({ request }) => {
        const { oauth, engine } = cloudflareDashboardEnv();
        const { handlePatchGuildSettingsBundle } = await import("#/lib/guild-settings-handlers");
        return handlePatchGuildSettingsBundle(request, oauth, engine);
      },
    },
  },
});