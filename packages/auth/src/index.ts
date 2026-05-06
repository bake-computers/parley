import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq } from "drizzle-orm";
import type { DbClient } from "@parley/db/client";
import { authAccounts, authSessions, authUsers, authVerifications } from "@parley/db/schema";

export const AUTHORIZED_DISCORD_USER_IDS = new Set([
  "980859238630948886",
  "1019159791886671872",
  "1145275452559196214",
]);

export interface ParleyAuthEnv {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  AUTH_COOKIE_DOMAIN?: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_OAUTH_CLIENT_ID?: string;
  DISCORD_OAUTH_CLIENT_SECRET?: string;
}

function readDiscordClientId(env: ParleyAuthEnv): string {
  return env.DISCORD_OAUTH_CLIENT_ID ?? env.DISCORD_APPLICATION_ID ?? "";
}

export function createParleyAuth(db: DbClient, env: ParleyAuthEnv) {
  const clientId = readDiscordClientId(env);
  const clientSecret = env.DISCORD_OAUTH_CLIENT_SECRET ?? "";

  return betterAuth({
    appName: "Parley HQ",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      "https://app.parley.bot",
      "https://parley-web.ryzm.workers.dev",
      "https://parley.bot",
      "http://localhost:3001",
      "http://localhost:3000",
      "http://localhost:8787",
    ],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    socialProviders: {
      discord: {
        clientId,
        clientSecret,
        scope: ["identify", "email", "guilds"],
      },
    },
    advanced: {
      ...(env.AUTH_COOKIE_DOMAIN
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: env.AUTH_COOKIE_DOMAIN,
            },
          }
        : {}),
      useSecureCookies: env.BETTER_AUTH_URL?.startsWith("https://") ?? true,
      cookiePrefix: "parley",
    },
  });
}

export async function readDiscordAccountIdForUser(
  db: DbClient,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({
      accountId: authAccounts.accountId,
    })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, "discord")))
    .limit(1);

  return rows[0]?.accountId ?? null;
}

export async function readAuthorizedSession(
  auth: ReturnType<typeof createParleyAuth>,
  db: DbClient,
  headers: Headers,
): Promise<SessionWithGuilds | null> {
  const access = await readSessionAccess(auth, db, headers);
  if (access.status !== "authorized") return null;
  const guilds = await readGuildAccess(auth, db, headers);
  return {
    status: "authorized",
    discordUserId: access.discordUserId,
    session: access.session,
    guilds,
  };
}

export async function readDashboardSession(
  auth: ReturnType<typeof createParleyAuth>,
  db: DbClient,
  headers: Headers,
): Promise<SessionWithGuilds | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const discordUserId = await readDiscordAccountIdForUser(db, session.user.id);
  if (!discordUserId) return null;

  const guilds = await readGuildAccess(auth, db, headers);
  return {
    status: "authorized",
    discordUserId,
    session,
    guilds,
  };
}

type AuthSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createParleyAuth>["api"]["getSession"]>>
>;

export type AuthorizedSession = {
  status: "authorized";
  discordUserId: string;
  session: AuthSession;
};

export type GuildWithPermissions = {
  id: string;
  name: string | null;
  icon: string | null;
  permissions: number;
};

export type SessionWithGuilds = AuthorizedSession & {
  guilds: GuildWithPermissions[];
};

export type SessionAccess =
  | {
      status: "signed_out";
    }
  | {
      status: "forbidden";
      discordUserId: string | null;
      session: AuthSession;
    }
  | AuthorizedSession;

// Helper: filter guilds by admin/manager permissions
export function filterGuildsByPermissions(guilds: GuildWithPermissions[]): GuildWithPermissions[] {
  return guilds.filter((g) => (g.permissions & 0x8) === 0x8 || (g.permissions & 0x20) === 0x20);
}

// Check global admin
export function isGlobalAdmin(discordUserId: string): boolean {
  return AUTHORIZED_DISCORD_USER_IDS.has(discordUserId);
}

// Read guild access for a given session (Discord tokens/endpoint calls)
export async function readGuildAccess(
  auth: ReturnType<typeof createParleyAuth>,
  db: DbClient,
  headers: Headers,
): Promise<GuildWithPermissions[]> {
  // Step 1: Get current session to identify user
  const session: AuthSession | null = await auth.api.getSession({ headers } as any);
  if (!session) return [];

  // Step 2: Map to Discord userId via DB
  const discordUserId = await readDiscordAccountIdForUser(db, (session.user as any)?.id ?? "");
  if (!discordUserId) return [];

  // Step 3: Resolve Bearer token from session data (best-effort)
  let accessToken: string | null = null;
  const sAny: any = session as any;
  accessToken = sAny?.accessToken ?? sAny?.token ?? sAny?.oauth?.accessToken ?? null;
  if (!accessToken && sAny?.providerAccounts) {
    const dc = sAny.providerAccounts.find((a: any) => a.providerId === "discord");
    accessToken = dc?.accessToken ?? dc?.token ?? null;
  }
  if (!accessToken && sAny?.accounts) {
    const dc = sAny.accounts.find((a: any) => a.providerId === "discord");
    accessToken = dc?.accessToken ?? dc?.token ?? null;
  }
  if (!accessToken) {
    // Cannot fetch guilds without a token
    return [];
  }

  // Step 4: Call Discord API to fetch guilds
  const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 429) {
    // Rate limited - attempt to return cached data if available
    const cache: any = (globalThis as any).Cache;
    if (cache && typeof cache.get === "function") {
      const cached = await cache.get(`guilds:${discordUserId}`);
      if (cached) {
        try {
          return JSON.parse(cached) as GuildWithPermissions[];
        } catch {
          // fallthrough to empty
        }
      }
    }
    return [];
  }

  if (!res.ok) return [];
  const data = (await res.json()) as GuildWithPermissions[];

  // Step 5: Cache result for 5 minutes (300s) if KV available or fall back to in-memory cache via Cache binding
  const cache: any = (globalThis as any).Cache;
  const ttl = 300; // seconds
  if (cache && typeof cache.put === "function") {
    try {
      await cache.put(`guilds:${discordUserId}`, JSON.stringify(data), { expirationTtl: ttl });
    } catch {
      // ignore caching failures in prod fallback
    }
  } else {
    // fallback: simple in-process cache (per-process)
    GuildsInMemoryCache.set(discordUserId, data);
  }

  return data;
}

// Simple in-process cache fallback (per-process)
const GuildsInMemoryCache = {
  _store: new Map<string, GuildWithPermissions[]>(),
  get(userId: string) {
    const v = this._store.get(userId);
    return v || null;
  },
  set(userId: string, value: GuildWithPermissions[]) {
    this._store.set(userId, value);
  },
};

export async function readSessionAccess(
  auth: ReturnType<typeof createParleyAuth>,
  db: DbClient,
  headers: Headers,
): Promise<SessionAccess> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    return {
      status: "signed_out",
    };
  }

  const discordUserId = await readDiscordAccountIdForUser(db, session.user.id);
  if (!discordUserId || !AUTHORIZED_DISCORD_USER_IDS.has(discordUserId)) {
    return {
      status: "forbidden",
      discordUserId,
      session,
    };
  }

  return {
    status: "authorized",
    discordUserId,
    session,
  };
}
