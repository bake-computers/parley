import { helpCommand } from "#/interactions/help";
import { historyButtonHandler } from "#/interactions/history/components";
import { historyCommand } from "#/interactions/history/slash";
import {
  linkSelectHandler,
  linkSlashCommand,
  usernameModalHandler,
} from "#/interactions/link/index";
import { pingCommand } from "#/interactions/ping";
import { profileCommand } from "#/interactions/profile";
import {
  teamButtonHandler,
  teamModalHandler,
  teamSelectHandler,
  teamSlashCommand,
} from "#/interactions/team/index";
import { tournamentSlashCommand } from "#/interactions/tournament/slash";
import {
  userButtonHandler,
  userModalHandler,
  userSelectHandler,
  userSlashCommand,
} from "#/interactions/user/index";

export const workerHandlers = [
  helpCommand,
  historyButtonHandler,
  historyCommand,
  linkSelectHandler,
  linkSlashCommand,
  pingCommand,
  profileCommand,
  teamButtonHandler,
  teamModalHandler,
  teamSelectHandler,
  teamSlashCommand,
  tournamentSlashCommand,
  userButtonHandler,
  userModalHandler,
  userSelectHandler,
  userSlashCommand,
  usernameModalHandler,
] as const;
