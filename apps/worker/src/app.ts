import { ParleyClient } from "@parley/runtime";
import { helpCommand } from "./interactions/help.js";
import { linkButtonHandler, linkSlashCommand, usernameModalHandler } from "./interactions/link/index.js";
import { pingCommand } from "./interactions/ping.js";
import { profileCommand } from "./interactions/profile.js";

export function createApp(): ParleyClient {
  const client = new ParleyClient();
  client.loadHandlers(
    helpCommand,
    linkButtonHandler,
    linkSlashCommand,
    pingCommand,
    profileCommand,
    usernameModalHandler,
  );
  return client;
}
