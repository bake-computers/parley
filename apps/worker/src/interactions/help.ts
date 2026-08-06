import {
  ContainerBuilder,
  MediaGalleryBuilder,
  SlashCommand,
  TextDisplayBuilder,
} from "@parley/runtime";
import { replyV2 } from "#/ui/discord";
import { UI_TOKENS } from "#/ui/tokens";

const PARLEY_IMAGE_URL = "https://cdn.parley.bot/Help%20Banner%20640x120%402x.png";

// Command snowflakes are stable: one Discord application backs every environment.
const COMMANDS: ReadonlyArray<readonly [mention: string, description: string]> = [
  ["</ping:1514360162784252054>", "Check if the bot is responsive"],
  ["</help:1514360162784252055>", "List all available commands"],
  ["</link:1514360162784252056>", "Link your Discord account via an interactive wizard"],
  ["</profile:1514360162784252057>", "View your linked game accounts and stats"],
  ["</history:1516957458734780476>", "View your match history for a linked account"],
  ["</team:1531692337254891551>", "Assemble balanced custom teams and track the match"],
  ["</tournament create:1524914650981077133>", "Create and join Parley tournaments"],
  [
    "</user delete:1515667381676937328>",
    "Manage your matchmaking opt-out, region, profile visibility, and data",
  ],
  [
    "</user settings:1515667381676937328>",
    "Manage your matchmaking opt-out, region, profile visibility, and data",
  ],
];

function formatLine([mention, description]: (typeof COMMANDS)[number]): string {
  return `${mention} - ${description}`;
}

export const helpCommand = new SlashCommand()
  .setName("help")
  .setDescription("List all available commands")
  .addHandler(async (interaction) => {
    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Parley Commands**"),
        ...COMMANDS.map((entry) => new TextDisplayBuilder().setContent(formatLine(entry))),
        new MediaGalleryBuilder().addImage(PARLEY_IMAGE_URL, "Parley"),
      );
    await replyV2(interaction, container, true);
  });
