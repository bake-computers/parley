import { ParleyClient } from "@parley/runtime";
import { workerHandlers } from "#/handlers";

export function createApp(): ParleyClient {
  const client = new ParleyClient();
  client.loadHandlers(...workerHandlers);
  return client;
}
