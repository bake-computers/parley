import { ParleyClient } from "@parley/runtime";
import { helpCommand } from "./interactions/help.js";
import { historyCommand } from "./interactions/history/slash.js";
import {
  linkButtonHandler,
  linkSlashCommand,
  usernameModalHandler,
} from "./interactions/link/index.js";
import { pingCommand } from "./interactions/ping.js";
import { profileCommand } from "./interactions/profile.js";
import {
  settingsButtonHandler,
  settingsSelectHandler,
  settingsSlashCommand,
} from "./interactions/settings/index.js";
import {
  userButtonHandler,
  userModalHandler,
  userSlashCommand,
} from "./interactions/user/index.js";

export function createApp(): ParleyClient {
  const client = new ParleyClient();
  client.loadHandlers(
    helpCommand,
    historyCommand,
    linkButtonHandler,
    linkSlashCommand,
    pingCommand,
    profileCommand,
    settingsButtonHandler,
    settingsSelectHandler,
    settingsSlashCommand,
    userButtonHandler,
    userModalHandler,
    userSlashCommand,
    usernameModalHandler,
  );
  return client;
}
