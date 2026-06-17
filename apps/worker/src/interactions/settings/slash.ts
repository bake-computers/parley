import { SlashCommand, type ChatInputCommandInteraction } from "@parley/runtime";
import { getGuildSettingsClient, type EngineTransportEnv } from "../../transport.js";
import { editReplyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { MANAGE_GUILD_BITFIELD } from "./constants.js";
import { invokeGetNotificationSettings } from "./rpc.js";
import { buildNotificationSettingsCard, buildSettingsErrorCard } from "./ui.js";

export const settingsSlashCommand = new SlashCommand()
  .setName("settings")
  .setDescription("Configure guild notification settings")
  .setDefaultMemberPermissions(MANAGE_GUILD_BITFIELD)
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;
    const guildId = interaction.guildId;
    if (!guildId) {
      await editReplyV2(
        interaction,
        buildSettingsErrorCard("This command can only be used in a server.", {}),
      );
      return;
    }

    await interaction.deferReply(true);

    const client = getGuildSettingsClient(env) as never;
    const r = await invokeGetNotificationSettings(client, guildId);
    if (r.isErr() || !r.value.success || !r.value.settings) {
      const message = r.isErr()
        ? r.error.message
        : (r.value.error?.message ?? "Could not load notification settings.");
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildSettingsErrorCard(message, emojis));
      return;
    }
    const emojis = await resolveEmojis(interaction);
    const card = buildNotificationSettingsCard(r.value.settings, emojis);
    await editReplyV2(interaction, card);
  });
