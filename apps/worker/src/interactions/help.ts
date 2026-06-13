import {
  ContainerBuilder,
  SlashCommand,
  TextDisplayBuilder,
} from "@parley/runtime";
import { replyV2 } from "../ui/discord.js";
import { UI_TOKENS } from "../ui/tokens.js";

export const helpCommand = new SlashCommand()
  .setName("help")
  .setDescription("List all available commands")
  .addHandler(async (interaction) => {
    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Parley Commands**"),
        new TextDisplayBuilder().setContent(
          "**/ping** — Check if the bot is responsive",
        ),
        new TextDisplayBuilder().setContent(
          "**/help** — List all available commands",
        ),
        new TextDisplayBuilder().setContent(
          "**/link** — Link your Discord account via an interactive wizard",
        ),
        new TextDisplayBuilder().setContent(
          "**/profile** — View your linked game accounts and stats",
        ),
        new TextDisplayBuilder().setContent(
          "**/user** — Manage your language, matchmaking opt-out, profile visibility, timezone, and data",
        ),
      );
    await replyV2(interaction, container, true);
  });
