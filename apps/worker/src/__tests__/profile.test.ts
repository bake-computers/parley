import { describe, it, expect, mock, afterEach } from "bun:test";
import type { ChatInputCommandInteraction } from "@parley/runtime";
import { ok, err } from "neverthrow";
import { ConnectError } from "@connectrpc/connect";
import { createMockIdentityClient } from "./setup.js";

describe("profileCommand", () => {
  afterEach(() => {
    mock.restore();
  });

  it("shows linked identities when found", async () => {
    const mockClient = createMockIdentityClient();
    mockClient.lookupByDiscord.mockResolvedValue(
      ok({
        success: true,
        identities: [
          {
            game: 1,
            discordUserId: "123456",
            playerId: 42,
            username: "PlayerOne",
            usernameNormalized: "playerone",
            platform: "uplay",
            profileId: "",
            profileUrl: "",
            internalElo: 1200,
            internalMatches: 50,
            internalWins: 30,
            internalLosses: 20,
          },
          {
            game: 2,
            discordUserId: "123456",
            playerId: 99,
            username: "BrawlerX",
            usernameNormalized: "brawlerx",
            platform: "supercell",
            profileId: "",
            profileUrl: "",
            internalElo: 800,
            internalMatches: 20,
            internalWins: 15,
            internalLosses: 5,
          },
        ],
      } as any),
    );

    mock.module("../transport.js", () => ({
      getIdentityClient: () => mockClient,
    }));

    const deferMock = mock(() => Promise.resolve(ok({})));
    const editMock = mock(() => Promise.resolve(ok({})));
    const mockInteraction = {
      user: { id: "123456" },
      deferReply: deferMock,
      editReply: editMock,
      context: { env: { ENGINE_SERVICE_URL: "http://localhost:50051" } },
    } as unknown as ChatInputCommandInteraction;

    const { profileCommand } = await import("../commands/profile.js");
    await profileCommand.execute(mockInteraction);

    expect(deferMock).toHaveBeenCalledWith(true);

    expect(editMock.mock.calls.length).toBeGreaterThan(0);
    const editCall = (editMock.mock.calls as any[])[0];
    const editOptions = editCall[0] as any;
    expect(editOptions.embeds).toBeDefined();
    expect(editOptions.embeds.length).toBe(1);

    const [embed] = editOptions.embeds;
    const embedJson = typeof embed.toJSON === "function" ? embed.toJSON() : embed;
    expect(embedJson.color).toBe(0x22c55e);
    expect(embedJson.description).toContain("PlayerOne");
    expect(embedJson.description).toContain("BrawlerX");
  });

  it("shows info message when no accounts linked", async () => {
    const mockClient = createMockIdentityClient();
    mockClient.lookupByDiscord.mockResolvedValue(
      ok({
        success: true,
        identities: [],
      } as any),
    );

    mock.module("../transport.js", () => ({
      getIdentityClient: () => mockClient,
    }));

    const deferMock = mock(() => Promise.resolve(ok({})));
    const editMock = mock(() => Promise.resolve(ok({})));
    const mockInteraction = {
      user: { id: "123456" },
      deferReply: deferMock,
      editReply: editMock,
      context: { env: { ENGINE_SERVICE_URL: "http://localhost:50051" } },
    } as unknown as ChatInputCommandInteraction;

    const { profileCommand } = await import("../commands/profile.js");
    await profileCommand.execute(mockInteraction);

    expect(deferMock).toHaveBeenCalledWith(true);

    expect(editMock.mock.calls.length).toBeGreaterThan(0);
    const editCall = (editMock.mock.calls as any[])[0];
    const editOptions = editCall[0] as any;
    expect(editOptions.embeds).toBeDefined();
    expect(editOptions.embeds.length).toBe(1);

    const [embed] = editOptions.embeds;
    const embedJson = typeof embed.toJSON === "function" ? embed.toJSON() : embed;
    expect(embedJson.color).toBe(0xffffff);
    expect(embedJson.description).toContain("No accounts linked");
  });

  it("shows error embed when RPC fails", async () => {
    const mockClient = createMockIdentityClient();
    mockClient.lookupByDiscord.mockResolvedValue(
      err(new ConnectError("backend unreachable", 14)),
    );

    mock.module("../transport.js", () => ({
      getIdentityClient: () => mockClient,
    }));

    const deferMock = mock(() => Promise.resolve(ok({})));
    const editMock = mock(() => Promise.resolve(ok({})));
    const mockInteraction = {
      user: { id: "123456" },
      deferReply: deferMock,
      editReply: editMock,
      context: { env: { ENGINE_SERVICE_URL: "http://localhost:50051" } },
    } as unknown as ChatInputCommandInteraction;

    const { profileCommand } = await import("../commands/profile.js");
    await profileCommand.execute(mockInteraction);

    expect(deferMock).toHaveBeenCalledWith(true);

    expect(editMock.mock.calls.length).toBeGreaterThan(0);
    const editCall = (editMock.mock.calls as any[])[0];
    const editOptions = editCall[0] as any;
    expect(editOptions.embeds).toBeDefined();
    expect(editOptions.embeds.length).toBe(1);

    const [embed] = editOptions.embeds;
    const embedJson = typeof embed.toJSON === "function" ? embed.toJSON() : embed;
    expect(embedJson.color).toBe(0xef4444);
    expect(embedJson.description).toContain("backend unreachable");
  });
});
