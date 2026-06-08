import { describe, expect, it } from "bun:test";
import { ok } from "neverthrow";
import { createMockIdentityClient } from "./setup.js";

describe("MockIdentityClient", () => {
  it("linkAccount returns success response", async () => {
    const mockClient = createMockIdentityClient();

    mockClient.linkAccount.mockResolvedValue(
      ok({
        success: true,
        playerId: 123,
        usernameNormalized: "player123",
      } as any),
    );

    const req = {
      discordUserId: "123456",
      game: 1,
      username: "player123",
      platform: "uplay",
    } as any;

    const result = await mockClient.linkAccount(req);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.success).toBe(true);
      expect(result.value.playerId).toBe(123);
    }
  });

  it("lookupByDiscord returns identities list", async () => {
    const mockClient = createMockIdentityClient();

    mockClient.lookupByDiscord.mockResolvedValue(
      ok({
        success: true,
        identities: [
          {
            game: 1,
            discordUserId: "123456",
            playerId: 123,
            username: "player123",
            usernameNormalized: "player123",
            platform: "uplay",
            profileId: "",
            profileUrl: "",
            internalElo: 1200,
            internalMatches: 10,
            internalWins: 5,
            internalLosses: 5,
          },
        ],
      } as any),
    );

    const req = {
      discordUserId: "123456",
      game: 1,
    } as any;

    const result = await mockClient.lookupByDiscord(req);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.identities.length).toBe(1);
      expect(result.value.identities[0]!.playerId).toBe(123);
    }
  });
});
