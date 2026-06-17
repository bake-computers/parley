import {
  ContainerBuilder,
  EmbedBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
} from "@parley/runtime";
import { UI_TOKENS } from "../ui/tokens.js";
import type { NotifyPayload, NotificationEvent } from "./types.js";

const LOGO_URL = "https://parley.bot/parley-logo.svg";
const PARLEY_URL = "https://parley.bot";

interface BuiltMessage {
  readonly container: ContainerBuilder;
  readonly embed: EmbedBuilder;
}

const EVENT_TITLES: Record<NotificationEvent, string> = {
  "match.ready": "Match Ready",
  "match.result": "Match Result",
  "tournament.registration_open": "Tournament Registration Open",
  "tournament.started": "Tournament Started",
  "tournament.round": "Tournament Round Result",
  "tournament.champion": "Tournament Champion",
};

function eventTitle(event: NotificationEvent): string {
  return EVENT_TITLES[event];
}

function eventColor(event: NotificationEvent): number {
  if (event === "match.result" || event === "tournament.champion") {
    return UI_TOKENS.warning;
  }
  return UI_TOKENS.main;
}

function matchLink(payload: NotifyPayload): string | undefined {
  if (payload.public_uuid !== undefined && payload.public_uuid.length > 0) {
    return `${PARLEY_URL}/matches/${payload.public_uuid}`;
  }
  return undefined;
}

function buildDescription(event: NotificationEvent, payload: NotifyPayload): string {
  const parts: string[] = [];

  if (event === "match.ready") {
    parts.push("A match has been formed and is ready to play.");
  } else if (event === "match.result") {
    parts.push("A match result has been recorded.");
  } else if (event === "tournament.registration_open") {
    parts.push("A new tournament is open for registration.");
  } else if (event === "tournament.started") {
    parts.push("A tournament bracket has been generated and matches are underway.");
  } else if (event === "tournament.round") {
    parts.push("A tournament round result has been reported.");
  } else if (event === "tournament.champion") {
    parts.push("A tournament has concluded — a champion has been crowned!");
  }

  const link = matchLink(payload);
  if (link !== undefined) {
    parts.push(`[View Match](${link})`);
  }

  return parts.join("\n");
}

/**
 * Build a v2 Container and matching embed fallback for a notification event.
 *
 * The container uses Components v2 (TextDisplay + Separator) for modern
 * Discord clients. The embed is a fallback for clients that reject v2
 * component payloads.
 */
export function buildMessage(event: NotificationEvent, payload: NotifyPayload): BuiltMessage {
  const title = eventTitle(event);
  const description = buildDescription(event, payload);
  const color = eventColor(event);

  // V2 container
  const header = new TextDisplayBuilder().setContent(`**${title}**`);
  const body = new TextDisplayBuilder().setContent(description);
  const footer = new TextDisplayBuilder().setContent(
    `Game: **${payload.game.toUpperCase()}** · Guild: ${payload.host_guild_id}`,
  );

  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addComponents(header, new SeparatorBuilder().setDivider(true), body, footer);

  // Embed fallback
  const embed = new EmbedBuilder()
    .setTitle(`Parley — ${title}`)
    .setDescription(description)
    .setColor(color)
    .setThumbnail({ url: LOGO_URL })
    .setFooter({ text: `Parley · ${payload.game.toUpperCase()}`, icon_url: LOGO_URL })
    .setTimestamp();

  if (payload.match_id !== undefined) {
    embed.addFields({ name: "Match ID", value: payload.match_id, inline: true });
  }
  if (payload.tournament_id !== undefined) {
    embed.addFields({ name: "Tournament ID", value: payload.tournament_id, inline: true });
  }

  return { container, embed };
}
