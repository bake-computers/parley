import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { handleCreateTournament } from "#/lib/tournament/handlers";

export const Route = createFileRoute("/api/tournaments/create")({
  server: {
    handlers: {
      POST: ({ request }) => handleCreateTournament(request, env),
    },
  },
});
