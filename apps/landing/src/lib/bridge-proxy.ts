import { env } from "cloudflare:workers";
import { toBridgeRequest } from "./bridge-request.js";

export { toBridgeRequest } from "./bridge-request.js";

export async function fetchBridge(request: Request, bridgePath: string): Promise<Response> {
  return env.BRIDGE.fetch(toBridgeRequest(request, bridgePath));
}