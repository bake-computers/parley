import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { handleListTournamentMembers } from "#/lib/tournament/handlers";

export const Route = createFileRoute("/api/tournaments/$code/members")({
  server: {
    handlers: {
      GET: ({ request }) => handleListTournamentMembers(request, env),
    },
  },
});
