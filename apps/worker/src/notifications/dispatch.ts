import type { Context } from "hono";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { DiscordRestClient } from "@parley/runtime";
import { getGuildSettingsClient } from "../transport.js";
import type { EngineTransportEnv } from "../transport.js";
import { resolveTargets } from "./resolveTargets.js";
import { buildMessage } from "./buildMessage.js";
import { postChannelMessage } from "./postChannelMessage.js";
import type { NotifyPayload, NotificationSettings } from "./types.js";
import type { Not } from "bun-types/vendor/expect-type/utils.js";

export interface DispatchEnv extends EngineTransportEnv {
  readonly KV: KVNamespace;
  readonly NOTIFY_WEBHOOK_SECRET: string;
  readonly DISCORD_BOT_TOKEN?: string;
  readonly DISCORD_TOKEN?: string;
}

export type DiscordClientFactory = (token: string) => DiscordRestClient | Promise<DiscordRestClient>;

async function computeHmac(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    const aByte = aBytes[i];
    const bByte = bBytes[i];
    if (aByte === undefined || bByte === undefined) {
      return false;
    }
    diff |= aByte ^ bByte;
  }
  return diff === 0;
}

const DEDUPE_TTL_SECONDS = 7 * 24 * 60 * 60;

function dedupeKey(payload: NotifyPayload): string {
  const id = payload.match_id ?? payload.tournament_id ?? "unknown";
  return `notify:${payload.event}:${id}:${payload.host_guild_id}`;
}

async function defaultClientFactory(token: string): Promise<DiscordRestClient> {
  const { DiscordRestClient } = await import("@parley/runtime");
  return new DiscordRestClient(token);
}

const getSettingsFromMap = (
  map: ReadonlyMap<string, NotificationSettings>,
): ((guildId: string) => NotificationSettings | undefined) =>
  (guildId: string) =>
    map.get(guildId);


export function createDispatchHandler(clientFactory: DiscordClientFactory = defaultClientFactory) {
  return async function handleDispatch(c: Context<{ Bindings: DispatchEnv }>): Promise<Response> {
    const { env } = c;

    const rawBody = await c.req.text();

    const signature = c.req.header("X-Parley-Signature");
    if (signature === undefined) {
      return c.json({ error: "missing signature" }, 401);
    }

    const expected = await computeHmac(env.NOTIFY_WEBHOOK_SECRET, rawBody);
    if (!timingSafeEqual(signature, expected)) {
      return c.json({ error: "invalid signature" }, 401);
    }

    let payload: NotifyPayload;
    try {
      payload = JSON.parse(rawBody) as NotifyPayload;
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const key = dedupeKey(payload);
    const existing = await env.KV.get(key);
    if (existing !== null) {
      return c.json({ status: "skipped", reason: "duplicate" });
    }

    await env.KV.put(key, "1", { expirationTtl: DEDUPE_TTL_SECONDS });

    const guildClient = getGuildSettingsClient(env) as {
      getNotificationSettings: (req: unknown) => Promise<{
        guildId: string;
        game: string;
        matchResultsChannel: string;
        tournamentAnnouncementsChannel: string;
        crossGuildAnnouncementsEnabled: boolean;
        announceMatchReadyEnabled: boolean;
        announceMatchResultsEnabled: boolean;
      }>;
    };
    let hostSettings: NotificationSettings;
    try {
      const response = await guildClient.getNotificationSettings({
        guildId: payload.host_guild_id,
        game: payload.game,
      });
      hostSettings = {
        guildId: response.guildId,
        game: response.game,
        matchResultsChannel: response.matchResultsChannel,
        tournamentAnnouncementsChannel: response.tournamentAnnouncementsChannel,
        crossGuildAnnouncementsEnabled: response.crossGuildAnnouncementsEnabled,
        announceMatchReadyEnabled: response.announceMatchReadyEnabled,
        announceMatchResultsEnabled: response.announceMatchResultsEnabled,
      };
    } catch (err) {
      console.error("failed to load host guild settings", { guildId: payload.host_guild_id, error: err });
      return c.json({ status: "error", reason: "settings_fetch_failed" });
    }

    const participantSettings = new Map<string, NotificationSettings>()

    if (hostSettings.crossGuildAnnouncementsEnabled) {
      await Promise.all(
        payload.participant_guild_ids
          .filter((guildId) => guildId !== payload.host_guild_id)
          .map(async (guildId) => {
            try {
              const response = await guildClient.getNotificationSettings({
                guildId,
                game: payload.game,
              });
              participantSettings.set(guildId, {
                guildId: response.guildId,
                game: response.game,
                matchResultsChannel: response.matchResultsChannel,
                tournamentAnnouncementsChannel: response.tournamentAnnouncementsChannel,
                crossGuildAnnouncementsEnabled: response.crossGuildAnnouncementsEnabled,
                announceMatchReadyEnabled: response.announceMatchReadyEnabled,
                announceMatchResultsEnabled: response.announceMatchResultsEnabled,
              });
            } catch {
              // ignore missing or unreachable guild settings
            }
          }),
      );
    }

    const targets = resolveTargets(
      payload,
      hostSettings,
      getSettingsFromMap(participantSettings)
    )

    if (targets.length === 0) {
      return c.json({ status: "skipped", reason: "no_targets" });
    }

    const { container, embed } = buildMessage(payload.event, payload);

    const token = env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN;
    if (token === undefined) {
      console.error("no Discord bot token configured");
      return c.json({ status: "error", reason: "no_token" });
    }

    const discordClient = await clientFactory(token);

    const results = await Promise.all(
      targets.map(async (target) => {
        try {
          const result = await postChannelMessage(discordClient, target.channelId, container, embed);
          if (result.isErr()) {
            console.error("failed to post notification", {
              guildId: target.guildId,
              channelId: target.channelId,
              error: result.error,
            });
          }
          return result.isOk();
        } catch (err) {
          console.error("unexpected error posting notification", {
            guildId: target.guildId,
            channelId: target.channelId,
            error: err,
          });
          return false;
        }
      }),
    );

    const posted = results.filter(Boolean).length;
    return c.json({ status: "ok", posted, total: targets.length });
  };
}

export const handleDispatch = createDispatchHandler();
