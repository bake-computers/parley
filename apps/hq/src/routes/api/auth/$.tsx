import { createFileRoute } from "@tanstack/react-router";
import { createDashboardAuth } from "#/lib/server/auth";
import { withDb } from "#/lib/server/db";

async function handleRequest(request: Request): Promise<Response> {
  try {
    return await withDb(async (db) => {
      const auth = createDashboardAuth(db);
      return auth.handler(request);
    });
  } catch (error) {
    console.error("Auth handler error:", error);
    // Return 503 Service Unavailable for DB connection errors during dev
    return new Response(JSON.stringify({ error: "Database unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleRequest(request),
      POST: ({ request }) => handleRequest(request),
    },
  },
});
