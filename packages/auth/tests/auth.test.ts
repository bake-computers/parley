import { describe, expect, test } from "bun:test";
import { AUTHORIZED_DISCORD_USER_IDS, readSessionAccess, type SessionAccess } from "../src/index";

const allowedDiscordUserId = [...AUTHORIZED_DISCORD_USER_IDS][0] ?? "980859238630948886";

function createDb(accountId: string | null) {
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                limit: async () => (accountId ? [{ accountId }] : []),
              };
            },
          };
        },
      };
    },
  } as const;
}

function createAuth(session: SessionAccess["status"] extends never ? never : unknown) {
  return {
    api: {
      getSession: async () => session,
    },
  };
}

describe("readSessionAccess", () => {
  test("returns signed_out when the auth session is missing", async () => {
    const result = await readSessionAccess(
      createAuth(null) as never,
      createDb(null) as never,
      new Headers(),
    );

    expect(result).toEqual({ status: "signed_out" });
  });

  test("returns forbidden when the linked discord account is not on the allowlist", async () => {
    const result = await readSessionAccess(
      createAuth({
        user: {
          id: "user-1",
          name: "Test User",
          email: "test@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: {
          id: "session-1",
          userId: "user-1",
          expiresAt: new Date(),
          token: "token-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          ipAddress: null,
          userAgent: null,
        },
      }) as never,
      createDb("111111111111111111") as never,
      new Headers(),
    );

    expect(result.status).toBe("forbidden");
    if (result.status === "forbidden") {
      expect(result.discordUserId).toBe("111111111111111111");
    }
  });

  test("returns authorized when the linked discord account is on the allowlist", async () => {
    const result = await readSessionAccess(
      createAuth({
        user: {
          id: "user-1",
          name: "Test User",
          email: "test@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: {
          id: "session-1",
          userId: "user-1",
          expiresAt: new Date(),
          token: "token-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          ipAddress: null,
          userAgent: null,
        },
      }) as never,
      createDb(allowedDiscordUserId) as never,
      new Headers(),
    );

    expect(result.status).toBe("authorized");
    if (result.status === "authorized") {
      expect(result.discordUserId).toBe(allowedDiscordUserId);
      expect(result.session.user.id).toBe("user-1");
    }
  });
});
