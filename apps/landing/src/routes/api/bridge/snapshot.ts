import { createFileRoute } from "@tanstack/react-router";
import { fetchBridge } from "#/lib/bridge-proxy";

export const Route = createFileRoute("/api/bridge/snapshot")({
  server: {
    handlers: {
      GET: ({ request }) => fetchBridge(request, "/snapshot"),
      OPTIONS: ({ request }) => fetchBridge(request, "/snapshot"),
    },
  },
});
