import { helpCommand } from "#/interactions/help";
import { historyCommand } from "#/interactions/history/slash";
import {
  linkSelectHandler,
  linkSlashCommand,
  usernameModalHandler,
} from "#/interactions/link/index";
import { pingCommand } from "#/interactions/ping";
import { profileCommand } from "#/interactions/profile";
import { tournamentSlashCommand } from "#/interactions/tournament/slash";
import { userButtonHandler, userModalHandler, userSlashCommand } from "#/interactions/user/index";

export const workerHandlers = [
  helpCommand,
  historyCommand,
  linkSelectHandler,
  linkSlashCommand,
  pingCommand,
  profileCommand,
  tournamentSlashCommand,
  userButtonHandler,
  userModalHandler,
  userSlashCommand,
  usernameModalHandler,
] as const;
