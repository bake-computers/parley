import { ParleyClient } from "@parley/runtime";
import { workerHandlers } from "./handlers.js";

export function createApp(): ParleyClient {
  const client = new ParleyClient();
  client.loadHandlers(...workerHandlers);
  return client;
}