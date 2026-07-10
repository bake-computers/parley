import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { handleGetTournament, handleTournamentAction } from "#/lib/tournament/handlers";

export const Route = createFileRoute("/api/tournaments/$code")({
  server: {
    handlers: {
      GET: ({ request }) => handleGetTournament(request, env),
      POST: ({ request }) => handleTournamentAction(request, env),
    },
  },
});
