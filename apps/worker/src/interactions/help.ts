import {
  ContainerBuilder,
  DiscordRestClient,
  MediaGalleryBuilder,
  SlashCommand,
  TextDisplayBuilder,
} from "@parley/runtime";
import { replyV2 } from "#/ui/discord";
import { UI_TOKENS } from "#/ui/tokens";

const PARLEY_IMAGE_URL = "https://cdn.parley.bot/parley-new.png";

const COMMANDS: ReadonlyArray<readonly [name: string, description: string]> = [
  ["ping", "Check if the bot is responsive"],
  ["help", "List all available commands"],
  ["link", "Link your Discord account via an interactive wizard"],
  ["profile", "View your linked game accounts and stats"],
  ["history", "View your match history for a linked account"],
  ["team", "Assemble balanced custom teams and track the match"],
  ["tournament", "Create and join Parley tournaments"],
  ["user", "Manage your matchmaking opt-out, region, profile visibility, and data"],
];

export const helpCommand = new SlashCommand()
  .setName("help")
  .setDescription("List all available commands")
  .addHandler(async (interaction) => {
    const env = interaction.context.env;
    const applicationId = env.DISCORD_APPLICATION_ID ?? interaction.applicationId;
    const botToken = env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN;

    // Snowflakes differ per application, so resolve mentions live.
    const ids = new Map<string, string>();
    if (botToken && applicationId) {
      const result = await new DiscordRestClient(botToken).listApplicationCommands(applicationId);
      if (result.isOk()) {
        for (const command of result.value) {
          ids.set(command.name, command.id);
        }
      }
    }

    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Parley Commands**"),
        ...COMMANDS.map(([name, description]) => {
          const id = ids.get(name);
          const mention = id ? `</${name}:${id}>` : `**/${name}**`;
          return new TextDisplayBuilder().setContent(`${mention} - ${description}`);
        }),
        new MediaGalleryBuilder().addImage(PARLEY_IMAGE_URL, "Parley"),
      );
    await replyV2(interaction, container, true);
  });
