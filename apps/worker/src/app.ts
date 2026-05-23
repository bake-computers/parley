import { ParleyClient } from "@parley/runtime";
import { helpCommand } from "./commands/help.js";
import { linkCommand } from "./commands/link.js";
import { pingCommand } from "./commands/ping.js";
import { profileCommand } from "./commands/profile.js";

export function createApp(): ParleyClient {
  const client = new ParleyClient();
  client.loadHandlers(helpCommand, linkCommand, pingCommand, profileCommand);
  return client;
}