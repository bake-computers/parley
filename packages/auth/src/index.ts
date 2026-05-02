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
        scope: ["identify", "email"],
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
): Promise<AuthorizedSession | null> {
  const access = await readSessionAccess(auth, db, headers);
  return access.status === "authorized" ? access : null;
}

type AuthSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createParleyAuth>["api"]["getSession"]>>
>;

export type AuthorizedSession = {
  status: "authorized";
  discordUserId: string;
  session: AuthSession;
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
