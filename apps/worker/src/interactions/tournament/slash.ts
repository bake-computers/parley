import { Game } from "@parley/proto";
import {
  ContainerBuilder,
  SectionBuilder,
  SlashCommand,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type ChatInputCommandInteraction,
} from "@parley/runtime";
import { getTournamentClient, type EngineTransportEnv } from "#/transport";
import { UI_TOKENS } from "#/ui/tokens";
import { replyV2 } from "#/ui/discord";
import { buildTournamentQrUrl } from "./qr";

const BASE_URL = "https://parley.bot/tournaments";

function card(title: string, text: string): ContainerBuilder {
  return new ContainerBuilder().addComponents(
    new TextDisplayBuilder().setContent(`**${title}**\n${text}`),
  );
}

export function buildTournamentCreateCard(url: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.main)
    .addComponents(
      new SectionBuilder()
        .addText(
          new TextDisplayBuilder().setContent(
            `**Create a tournament**\nScan the QR code or use the [Parley website](${url}). Log in to choose the format, schedule, rules, and prizes.`,
          ),
        )
        .setAccessory(
          new ThumbnailBuilder()
            .setURL(buildTournamentQrUrl(url))
            .setDescription("Scan to create a tournament"),
        ),
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
        await replyV2(
          interaction,
          card(
            "Tournament creation unavailable",
            "The secure website handoff is not configured yet.",
          ),
        );
        return;
      }
      await replyV2(
        interaction,
        buildTournamentCreateCard(`${BASE_URL}/create?handoff=${encodeURIComponent(payload)}`),
      );
      return;
    }
    const code = String(interaction.options.getString("code") ?? "")
      .trim()
      .toUpperCase();
    // 10 chars since the entropy bump; 6-char legacy codes stay resolvable.
    if (!/^(?:[A-Z2-9]{6}|[A-Z2-9]{10})$/u.test(code)) {
      await replyV2(
        interaction,
        card("Tournament not found", "Use the code shared by the organizer."),
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
