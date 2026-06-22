import { env } from "cloudflare:workers";
import { toBridgeRequest } from "./bridge-request.js";

export { toBridgeRequest } from "./bridge-request.js";

export async function fetchBridge(request: Request, bridgePath: string): Promise<Response> {
  try {
    return await env.BRIDGE.fetch(toBridgeRequest(request, bridgePath));
  } catch (e) {
    const hint = e instanceof Error ? e.message : "fetch failed";
    return Response.json(
      {
        error: "bridge_unavailable",
        message: `Bridge not reachable in dev (${hint}). Start apps/bridge wrangler dev if you need leaderboard.`,
      },
      { status: 503 },
    );
  }
}