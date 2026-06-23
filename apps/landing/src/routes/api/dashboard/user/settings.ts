import { createFileRoute } from "@tanstack/react-router";
import { cloudflareDashboardEnv } from "#/lib/cloudflare/env";

export const Route = createFileRoute("/api/dashboard/user/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { oauth, engine } = cloudflareDashboardEnv();
        const { handleGetUserSettings } = await import("#/lib/dashboard/user/handlers");
        return handleGetUserSettings(request, oauth, engine);
      },
      PATCH: async ({ request }) => {
        const { oauth, engine } = cloudflareDashboardEnv();
        const { handlePatchUserSettings } = await import("#/lib/dashboard/user/handlers");
        return handlePatchUserSettings(request, oauth, engine);
      },
    },
  },
});