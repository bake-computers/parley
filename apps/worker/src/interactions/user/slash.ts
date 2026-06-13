import { SlashCommand, type ChatInputCommandInteraction } from "@parley/runtime";
import { assertAccepted } from "../_shared/acceptance.js";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { UserSettingsService } from "@parley/proto";
import { resolveEngineTransport } from "../../engine-transport.js";
import { editReplyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { invokeGetUserSettings } from "./rpc.js";
import { buildErrorCard, buildSettingsCard } from "./ui.js";
import type { EngineTransportEnv } from "../../transport.js";

export const userSlashCommand = new SlashCommand()
  .setName("user")
  .setDescription("Manage your language, matchmaking, visibility, timezone, and data")
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never))) {
      return;
    }
    await interaction.deferReply(true);

    const config = resolveEngineTransport(env);
    const transport = createConnectTransport({
      baseUrl: config.baseUrl,
      fetch: config.fetchImpl as typeof fetch,
      jsonOptions: { enumAsInteger: true },
    });
    const client = createClient(UserSettingsService, transport);
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
