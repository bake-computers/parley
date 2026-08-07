import { SlashCommand, type ChatInputCommandInteraction } from "@parley/runtime";
import { editReplyV2 } from "#/utils/discord";
import { getUserSettingsClient, type EngineTransportEnv } from "#/transport";
import { invokeGetUserSettings } from "#/interactions/user/rpc";
import { buildErrorCard, buildSettingsCard } from "#/interactions/user/ui";
import { buildDeleteConfirmModal } from "#/interactions/user/modal";

export const userSlashCommand = new SlashCommand()
  .setName("user")
  .setDescription("Manage your matchmaking, visibility, and data")
  .addSubcommand((subcommand) =>
    subcommand.setName("settings").setDescription("View your settings"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("delete").setDescription("Delete your Parley data"),
  )
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "delete") {
      await interaction.showModal(buildDeleteConfirmModal(interaction.user?.username ?? ""));
      return;
    }

    const env = interaction.context.env as EngineTransportEnv;

    const client = getUserSettingsClient(env);
    const discordUserId = interaction.user?.id ?? "";
    const r = await invokeGetUserSettings(client as never, discordUserId);
    if (r.isErr() || !r.value.success || !r.value.settings) {
      const message = r.isErr()
        ? r.error.message
        : (r.value.error?.message ?? "Could not load settings.");
      await editReplyV2(interaction, buildErrorCard(message));
      return;
    }
    const card = buildSettingsCard(r.value.settings);
    await editReplyV2(interaction, card);
  });
