import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { cloudflareOAuthEnv } from "#/lib/discord/cloudflare";
import { handleDiscordCallback } from "#/lib/discord/handlers";
import { engineEnvFromCloudflare } from "#/lib/engine/env";

export const Route = createFileRoute("/auth/discord/callback")({
  server: {
    handlers: {
      GET: ({ request }) =>
        handleDiscordCallback(request, cloudflareOAuthEnv(), engineEnvFromCloudflare(env)),
    },
  },
});
