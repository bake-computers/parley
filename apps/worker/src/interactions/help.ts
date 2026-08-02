import {
  ContainerBuilder,
  type AppEmojiName,
  type ApplicationEmojiCatalog,
  formatApplicationEmoji,
  MediaGalleryBuilder,
  SlashCommand,
  TextDisplayBuilder,
} from "@parley/runtime";
import { replyV2 } from "#/ui/discord";
import { UI_TOKENS } from "#/ui/tokens";
import { resolveEmojis } from "#/ui/emojis";

const PARLEY_IMAGE_URL = "https://cdn.parley.bot/parley-new.png";

// Command snowflakes are stable: one Discord application backs every environment.
const COMMANDS: ReadonlyArray<
  readonly [mention: string, emoji: AppEmojiName, description: string]
> = [
  ["</ping:1514360162784252054>", "reload", "Check if the bot is responsive"],
  ["</help:1514360162784252055>", "pin", "List all available commands"],
  ["</link:1514360162784252056>", "linked", "Link your Discord account via an interactive wizard"],
  ["</profile:1514360162784252057>", "global", "View your linked game accounts and stats"],
  ["</history:1516957458734780476>", "time", "View your match history for a linked account"],
  ["</team:1531692337254891551>", "calendar", "Assemble balanced custom teams and track the match"],
  [
    "</tournament:1524914650981077133>",
    "rank_challenger",
    "Create and join Parley tournaments",
  ],
  [
    "</user:1515667381676937328>",
    "redirect",
    "Manage your matchmaking opt-out, region, profile visibility, and data",
  ],
];

function formatLine(
  catalog: ApplicationEmojiCatalog,
  [mention, emoji, description]: (typeof COMMANDS)[number],
): string {
  const prefix = formatApplicationEmoji(catalog, emoji);
  return `${prefix ? `${prefix} ` : ""}${mention} - ${description}`;
}

export const helpCommand = new SlashCommand()
  .setName("help")
  .setDescription("List all available commands")
  .addHandler(async (interaction) => {
    const catalog = await resolveEmojis(interaction);
    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Parley Commands**"),
        ...COMMANDS.map((entry) => new TextDisplayBuilder().setContent(formatLine(catalog, entry))),
        new MediaGalleryBuilder().addImage(PARLEY_IMAGE_URL, "Parley"),
      );
    await replyV2(interaction, container, true);
  });
