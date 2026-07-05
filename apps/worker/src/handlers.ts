import { helpCommand } from "./interactions/help.js";
import { historyCommand } from "./interactions/history/slash.js";
import {
  linkSelectHandler,
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

export const workerHandlers = [
  helpCommand,
  historyCommand,
  linkSelectHandler,
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
] as const;
