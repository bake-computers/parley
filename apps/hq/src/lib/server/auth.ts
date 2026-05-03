import {
  createParleyAuth,
  readSessionAccess,
  readDiscordAccountIdForUser,
  AUTHORIZED_DISCORD_USER_IDS,
} from "@parley/auth";
import { env } from "cloudflare:workers";
import type { DbClient } from "@parley/db/client";

export function createDashboardAuth(db: DbClient) {
  return createParleyAuth(db, env);
}

export function readDashboardSession(db: DbClient, headers: Headers) {
  return readSessionAccess(createDashboardAuth(db), db, headers);
}

export type DashboardAuthResult =
  | { status: "signed_out" }
  | { status: "forbidden"; discordUserId: string | null; userName: string }
  | { status: "authorized"; discordUserId: string; userName: string; isGlobalAdmin: boolean };

export async function readDashboardAuth(
  db: DbClient,
  headers: Headers,
): Promise<DashboardAuthResult> {
  const auth = createDashboardAuth(db);
  const session = await auth.api.getSession({ headers });
  if (!session) {
    return { status: "signed_out" };
  }

  const discordUserId = await readDiscordAccountIdForUser(db, session.user.id);
  if (!discordUserId) {
    return {
      status: "forbidden",
      discordUserId: null,
      userName: session.user.name,
    };
  }

  return {
    status: "authorized",
    discordUserId,
    userName: session.user.name,
    isGlobalAdmin: AUTHORIZED_DISCORD_USER_IDS.has(discordUserId),
  };
}
