import { SlashCommand, type ChatInputCommandInteraction } from "@parley/runtime";
import { assertAccepted } from "#/interactions/_shared/acceptance";
import { editReplyV2 } from "#/ui/discord";
import { resolveEmojis } from "#/ui/emojis";
import { getUserSettingsClient, type EngineTransportEnv } from "#/transport";
import { invokeGetUserSettings } from "#/interactions/user/rpc";
import { buildErrorCard, buildSettingsCard } from "#/interactions/user/ui";

export const userSlashCommand = new SlashCommand()
  .setName("user")
  .setDescription("Manage your matchmaking, visibility, timezone, and data")
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never))) {
      return;
    }

    const client = getUserSettingsClient(env);
    const discordUserId = interaction.user?.id ?? "";
    const r = await invokeGetUserSettings(client as never, discordUserId);
    if (r.isErr() || !r.value.success || !r.value.settings) {
      const message = r.isErr()
        ? r.error.message
        : (r.value.error?.message ?? "Could not load settings.");
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildErrorCard(message, emojis));
      return;
    }
    const emojis = await resolveEmojis(interaction);
    const card = buildSettingsCard(r.value.settings, emojis);
    await editReplyV2(interaction, card);
  });
