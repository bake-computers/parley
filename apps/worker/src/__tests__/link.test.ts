import { beforeAll, beforeEach, describe, it, expect, mock, type Mock } from "bun:test";
import { ConnectError } from "@connectrpc/connect";
import { ok, err } from "neverthrow";
import type { ChatInputCommandInteraction } from "@parley/runtime";
import type {
  LinkAccountRequest,
  LinkAccountResponse,
} from "@parley/proto/identity/v1/identity_pb.js";
import type { Result } from "neverthrow";
import { Game } from "@parley/proto";

function createMockIdentityClient(): {
  linkAccount: Mock<
    (req: LinkAccountRequest) => Promise<Result<LinkAccountResponse, ConnectError>>
  >;
} {
  return {
    linkAccount: mock<
      (req: LinkAccountRequest) => Promise<Result<LinkAccountResponse, ConnectError>>
    >(),
  };
}

describe("linkCommand", () => {
  let mockClient: ReturnType<typeof createMockIdentityClient>;

  beforeAll(() => {
    mockClient = createMockIdentityClient();
    mock.module("../transport.js", () => ({
      getIdentityClient: mock(() => mockClient),
    }));
  });

  beforeEach(() => {
    mockClient.linkAccount.mockClear();
  });

  it("defers reply before calling the identity RPC", async () => {
    const { linkCommand } = await import("../commands/link.js");

    const callOrder: string[] = [];

    const deferReplyMock = mock<() => Promise<unknown>>(() => {
      callOrder.push("deferReply");
      return Promise.resolve();
    });

    const editReplyMock = mock<() => Promise<unknown>>(() => {
      callOrder.push("editReply");
      return Promise.resolve();
    });

    const mockInteraction = {
      options: {
        getString: mock((_name: string, _required?: boolean): string | null => "test_user"),
      },
      user: { id: "123456789" },
      deferReply: deferReplyMock,
      editReply: editReplyMock,
      context: {
        env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
      },
    } as unknown as ChatInputCommandInteraction;

    mockClient.linkAccount.mockResolvedValue(
      ok({
        success: true,
        playerId: 99,
        usernameNormalized: "test_user",
      } as LinkAccountResponse),
    );

    await linkCommand.execute(mockInteraction);

    const deferCallIdx = callOrder.indexOf("deferReply");
    const editCallIdx = callOrder.indexOf("editReply");

    expect(deferCallIdx).toBeGreaterThan(-1);
    expect(editCallIdx).toBeGreaterThan(-1);
    expect(deferCallIdx).toBeLessThan(editCallIdx);
    expect(deferReplyMock).toHaveBeenCalledWith(true);
  });

  it("edits reply with success embed on successful link", async () => {
    const { linkCommand } = await import("../commands/link.js");

    const editReplyMock = mock<() => Promise<unknown>>(() => Promise.resolve());

    const mockInteraction = {
      options: {
        getString: mock((name: string, _required?: boolean): string | null => {
          if (name === "username") { return "PlayerOne"; }
          if (name === "platform") { return "pc"; }
          return null;
        }),
      },
      user: { id: "987654321" },
      deferReply: mock(() => Promise.resolve()),
      editReply: editReplyMock,
      context: {
        env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
      },
    } as unknown as ChatInputCommandInteraction;

    mockClient.linkAccount.mockResolvedValue(
      ok({
        success: true,
        playerId: 42,
        usernameNormalized: "playerone",
      } as LinkAccountResponse),
    );

    await linkCommand.execute(mockInteraction);

    expect(editReplyMock).toHaveBeenCalledTimes(1);

    const callArg = (editReplyMock as ReturnType<typeof mock> & {
      mock: { calls: [unknown[]][] };
    }).mock?.calls?.[0]?.[0] as { embeds?: Record<string, unknown>[] } | undefined;

    expect(callArg?.embeds).toBeDefined();
    expect(Array.isArray(callArg?.embeds)).toBe(true);

    const embed = callArg?.embeds?.[0];
    expect(embed?.["color"]).toBe(0x22c55e);
    expect(embed?.["title"]).toBeString();
    expect(embed?.["description"]).toBeString();
    const description = embed?.["description"] as string;
    expect(description.includes("42")).toBe(true);
    expect(description.includes("playerone")).toBe(true);
    expect(embed?.["footer"]).toEqual({ text: "Parley" });
  });

  it("edits reply with error embed on RPC failure", async () => {
    const { linkCommand } = await import("../commands/link.js");

    const editReplyMock = mock<() => Promise<unknown>>(() => Promise.resolve());

    const mockInteraction = {
      options: {
        getString: mock((name: string, _required?: boolean): string | null => {
          if (name === "username") { return "BadPlayer"; }
          if (name === "platform") { return "xbox"; }
          return null;
        }),
      },
      user: { id: "111222333" },
      deferReply: mock(() => Promise.resolve()),
      editReply: editReplyMock,
      context: {
        env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
      },
    } as unknown as ChatInputCommandInteraction;

    mockClient.linkAccount.mockResolvedValue(err(new ConnectError("Account not found", 5)));

    await linkCommand.execute(mockInteraction);

    expect(editReplyMock).toHaveBeenCalledTimes(1);

    const callArg = (editReplyMock as ReturnType<typeof mock> & {
      mock: { calls: [unknown[]][] };
    }).mock?.calls?.[0]?.[0] as { embeds?: Record<string, unknown>[] } | undefined;

    expect(callArg?.embeds).toBeDefined();

    const embed = callArg?.embeds?.[0];
    expect(embed?.["color"]).toBe(0xef4444);
    expect(embed?.["title"]).toBeString();
    expect(embed?.["description"]).toBeString();
    expect(embed).toBeDefined();
    if (embed) {
      expect((embed["description"] as string).includes("Account not found")).toBe(true);
    }
    expect(embed?.["footer"]).toEqual({ text: "Parley" });
  });

  it("passes correct RPC arguments (username, platform, discordUserId, game)", async () => {
    const { linkCommand } = await import("../commands/link.js");

    const mockInteraction = {
      options: {
        getString: mock((name: string, _required?: boolean): string | null => {
          if (name === "username") { return "Alice"; }
          if (name === "platform") { return "playstation"; }
          return null;
        }),
      },
      user: { id: "444555666" },
      deferReply: mock(() => Promise.resolve()),
      editReply: mock(() => Promise.resolve()),
      context: {
        env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
      },
    } as unknown as ChatInputCommandInteraction;

    mockClient.linkAccount.mockResolvedValue(
      ok({
        success: true,
        playerId: 7,
        usernameNormalized: "alice",
      } as LinkAccountResponse),
    );

    await linkCommand.execute(mockInteraction);

    expect(mockClient.linkAccount).toHaveBeenCalledTimes(1);

    const calls = (mockClient.linkAccount as ReturnType<typeof mock> & {
      mock: { calls: [LinkAccountRequest[]][] };
    }).mock?.calls;
    const rpcArg = calls?.[0]?.[0] as LinkAccountRequest | undefined;

    expect(rpcArg?.discordUserId).toBe("444555666");
    expect(rpcArg?.username).toBe("Alice");
    expect(rpcArg?.platform).toBe("playstation");
    expect(rpcArg?.game).toBe(Game.R6);
  });
});
