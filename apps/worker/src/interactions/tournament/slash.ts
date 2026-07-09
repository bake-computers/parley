import { Game } from "@parley/proto";
import { ContainerBuilder, SlashCommand, TextDisplayBuilder, type ChatInputCommandInteraction } from "@parley/runtime";
import { getTournamentClient, type EngineTransportEnv } from "#/transport";
import { replyV2 } from "#/ui/discord";

const BASE_URL = "https://parley.bot/tournaments";

function card(title: string, text: string): ContainerBuilder {
  return new ContainerBuilder().addComponents(
    new TextDisplayBuilder().setContent(`**${title}**\n${text}`),
  );
}

function toBase64Url(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCodePoint(byte);
  }
  return toBase64Url(binary);
}

async function signedHandoff(interaction: ChatInputCommandInteraction): Promise<string> {
  const env = interaction.context.env as EngineTransportEnv & {
    TOURNAMENT_HANDOFF_SECRET?: string;
  };
  const payload = toBase64Url(
    JSON.stringify({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user?.id,
      expiresAt: Date.now() + 600_000,
    }),
  );
  if (!env.TOURNAMENT_HANDOFF_SECRET) {
    throw new Error("TOURNAMENT_HANDOFF_SECRET is not configured");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.TOURNAMENT_HANDOFF_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${bytesToBase64Url(signature)}.${payload}`;
}

export const tournamentSlashCommand = new SlashCommand()
  .setName("tournament")
  .setDescription("Create and join Parley tournaments")
  .addSubcommand((s) => s.setName("create").setDescription("Create a tournament on the website"))
  .addSubcommand((s) =>
    s
      .setName("join")
      .setDescription("Open a tournament by code")
      .addStringOption((o) =>
        o.setName("code").setDescription("Tournament code").setRequired(true),
      ),
  )
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    if (interaction.options.getSubcommand() === "create") {
      if (!interaction.guildId || !interaction.channelId || !interaction.user?.id) {
        await replyV2(
          interaction,
          card("Tournament creation", "Run this command from the host server."),
        );
        return;
      }
      let payload: string;
      try {
        payload = await signedHandoff(interaction);
      } catch {
        await replyV2(interaction, card("Tournament creation unavailable", "The secure website handoff is not configured yet."));
        return;
      }
      await replyV2(
        interaction,
        card(
          "Create a tournament",
          `Tournament setup lives on the [Parley website](${BASE_URL}/create?handoff=${encodeURIComponent(payload)}). Log in to choose the format, schedule, rules, and prizes.`,
        ),
      );
      return;
    }
    const code = String(interaction.options.getString("code") ?? "").trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/u.test(code)) {
      await replyV2(
        interaction,
        card("Tournament not found", "Use the six-character code shared by the organizer."),
      );
      return;
    }
    try {
      const client = getTournamentClient(interaction.context.env as EngineTransportEnv) as {
        getTournamentByCode(x: unknown): Promise<{
          success: boolean;
          tournament?: { name: string; status: string };
        }>;
      };
      const r = await client.getTournamentByCode({ publicCode: code, game: Game.R6 });
      if (!r.success || !r.tournament) {
        throw new Error("not found");
      }
      await replyV2(
        interaction,
        card(
          r.tournament.name,
          `Status: **${r.tournament.status}**\nOpen the [tournament page](${BASE_URL}/${code}), log in with Discord, and select the same team as your teammates.`,
        ),
      );
    } catch {
      await replyV2(
        interaction,
        card("Tournament not found", "Check the code and ask the organizer for a current link."),
      );
    }
  });
