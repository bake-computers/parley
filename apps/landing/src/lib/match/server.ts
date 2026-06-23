import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { fetchMatchFromCacheOrBridge, type MatchData } from "./cache.js";

export const getMatchForRoute = createServerFn({ method: "GET" })
  .validator((data: { guildId: string; uuid: string }) => data)
  .handler(async ({ data }): Promise<MatchData | null> => {
    return fetchMatchFromCacheOrBridge(env, data.guildId, data.uuid);
  });