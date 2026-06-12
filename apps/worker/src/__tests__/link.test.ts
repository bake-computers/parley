import { afterEach, beforeEach, describe, it, expect, mock, type Mock } from "bun:test";
import { ConnectError } from "@connectrpc/connect";
import { ok, err } from "neverthrow";
import { COMPONENTS_V2_EPHEMERAL } from "../ui/discord.js";
import type {
  ChatInputCommandInteraction,
  ContainerBuilder,
  MessageComponentInteraction,
  ModalInteraction,
} from "@parley/runtime";
import type { LinkAccountResponse } from "@parley/proto/identity/v1/identity_pb.js";
import type { Result } from "neverthrow";
import { Game } from "@parley/proto";

function createMockIdentityClient(): {
  linkAccount: Mock<
    (req: {
      discordUserId: string;
      game: number;
      username: string;
      platform: string;
      guildId?: string;
    }) => Promise<Result<LinkAccountResponse, ConnectError>>
  >;
} {
  return {
    linkAccount:
      mock<
        (req: {
          discordUserId: string;
          game: number;
          username: string;
          platform: string;
          guildId?: string;
        }) => Promise<Result<LinkAccountResponse, ConnectError>>
      >(),
  };
}

type MockWithCalls = ReturnType<typeof mock> & {
  mock: { calls: unknown[][] };
};

function getEditPayload(editReplyMock: MockWithCalls): Record<string, unknown> {
  const call = editReplyMock.mock.calls[0];
  return (call?.[0] ?? {}) as Record<string, unknown>;
}

function containerJson(payload: {
  components?: unknown[];
  flags?: number;
}): Record<string, unknown> {
  const container = payload.components?.[0];
  if (container && typeof container === "object" && "toJSON" in container) {
    return (container as ContainerBuilder).toJSON() as Record<string, unknown>;
  }
  return (container ?? {}) as Record<string, unknown>;
}

function textFromContainer(container: Record<string, unknown>): string {
  return JSON.stringify(container);
}

describe("link wizard", () => {
  let mockClient: ReturnType<typeof createMockIdentityClient>;

  beforeEach(() => {
    mockClient = createMockIdentityClient();
    mock.module("../transport.js", () => ({
      getIdentityClient: mock(() => mockClient),
    }));
    mock.module("../ui/emojis.js", () => ({
      resolveEmojis: mock(() => Promise.resolve({})),
    }));
    mockClient.linkAccount.mockClear();
  });

  afterEach(() => {
    mock.restore();
  });

  describe("linkSlashCommand", () => {
    it("defers reply before editing with platform selection", async () => {
      const { linkSlashCommand } = await import("../interactions/link/slash.js");

      const callOrder: string[] = [];
      const deferReplyMock = mock(() => {
        callOrder.push("deferReply");
        return Promise.resolve();
      });
      const editReplyMock = mock(() => {
        callOrder.push("editReply");
        return Promise.resolve();
      });

      const mockInteraction = {
        user: { id: "123456789" },
        deferReply: deferReplyMock,
        editReply: editReplyMock,
        context: {
          env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
          set: () => {},
          get: () => undefined,
        },
      } as unknown as ChatInputCommandInteraction;

      await linkSlashCommand.execute(mockInteraction);

      expect(callOrder.indexOf("deferReply")).toBeLessThan(callOrder.indexOf("editReply"));
      expect(deferReplyMock).toHaveBeenCalledWith(true);

      const callArg = getEditPayload(editReplyMock as MockWithCalls) as {
        components?: unknown[];
        flags?: number;
      };
      expect(callArg.flags).toBe(COMPONENTS_V2_EPHEMERAL);
      const json = containerJson(callArg);
      expect(textFromContainer(json)).toContain("Link Your Account");
      expect(textFromContainer(json)).toContain("link/platform/pc");
    });
  });

  describe("linkButtonHandler", () => {
    it("opens username modal even without embedded wizard message id", async () => {
      const { linkButtonHandler } = await import("../interactions/link/components.js");

      const showModalMock = mock(() => Promise.resolve());

      const mockInteraction = {
        customId: "link/username/xbox",
        showModal: showModalMock,
        deferReply: mock(() => Promise.resolve()),
        deferUpdate: mock(() => Promise.resolve()),
        editReply: mock(() => Promise.resolve()),
        context: {
          env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
          set: () => {},
          get: () => undefined,
        },
      } as unknown as MessageComponentInteraction;

      await linkButtonHandler.execute(mockInteraction);

      expect(showModalMock).toHaveBeenCalled();
      const modalArg = (showModalMock as MockWithCalls).mock.calls[0]?.[0] as {
        toJSON?: () => { custom_id?: string };
      };
      const modalJson = modalArg?.toJSON?.() ?? modalArg;
      expect((modalJson as { custom_id?: string }).custom_id).toBe("link/submit/xbox");
    });

    it("embeds wizard message id when opening username modal", async () => {
      const { linkButtonHandler } = await import("../interactions/link/components.js");

      const showModalMock = mock(() => Promise.resolve());

      const mockInteraction = {
        customId: "link/username/xbox/1514369781434945616",
        messageId: "1514369781434945616",
        showModal: showModalMock,
        deferReply: mock(() => Promise.resolve()),
        deferUpdate: mock(() => Promise.resolve()),
        editReply: mock(() => Promise.resolve()),
        context: {
          env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
          set: () => {},
          get: () => undefined,
        },
      } as unknown as MessageComponentInteraction;

      await linkButtonHandler.execute(mockInteraction);

      expect(showModalMock).toHaveBeenCalled();
      const modalArg = (showModalMock as MockWithCalls).mock.calls[0]?.[0] as {
        toJSON?: () => { custom_id?: string };
      };
      const modalJson = modalArg?.toJSON?.() ?? modalArg;
      expect((modalJson as { custom_id?: string }).custom_id).toBe(
        "link/submit/xbox/1514369781434945616",
      );
    });

    it("updates to username step on platform select without RPC", async () => {
      const { linkButtonHandler } = await import("../interactions/link/components.js");

      const deferUpdateMock = mock(() => Promise.resolve());
      const editReplyMock = mock(() => Promise.resolve(ok({ id: "1514369781434945616" })));

      const mockInteraction = {
        customId: "link/platform/pc",
        deferUpdate: deferUpdateMock,
        deferReply: mock(() => Promise.resolve()),
        editReply: editReplyMock,
        context: {
          env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
          set: () => {},
          get: () => undefined,
        },
      } as unknown as MessageComponentInteraction;

      await linkButtonHandler.execute(mockInteraction);

      expect(deferUpdateMock).toHaveBeenCalled();
      expect(editReplyMock).toHaveBeenCalledTimes(2);
      expect(mockClient.linkAccount).not.toHaveBeenCalled();

      const secondEdit = (editReplyMock as MockWithCalls).mock.calls[1];
      const callArg = (secondEdit?.[0] ?? {}) as { components?: unknown[] };
      const json = containerJson(callArg);
      expect(textFromContainer(json)).toContain("Enter Username");
      expect(textFromContainer(json)).toContain("link/username/pc/1514369781434945616");
    });

    it("restarts wizard on cancel without RPC", async () => {
      const { linkButtonHandler } = await import("../interactions/link/components.js");

      const deferUpdateMock = mock(() => Promise.resolve());
      const editReplyMock = mock(() => Promise.resolve());

      const mockInteraction = {
        customId: "link/cancel",
        deferUpdate: deferUpdateMock,
        deferReply: mock(() => Promise.resolve()),
        editReply: editReplyMock,
        context: {
          env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
          set: () => {},
          get: () => undefined,
        },
      } as unknown as MessageComponentInteraction;

      await linkButtonHandler.execute(mockInteraction);

      expect(deferUpdateMock).toHaveBeenCalled();
      expect(mockClient.linkAccount).not.toHaveBeenCalled();

      const callArg = getEditPayload(editReplyMock as MockWithCalls) as { components?: unknown[] };
      const json = containerJson(callArg);
      expect(textFromContainer(json)).toContain("Link Your Account");
      expect(textFromContainer(json)).toContain("link/platform/pc");
    });

    it("calls RPC only on confirm", async () => {
      const { linkButtonHandler } = await import("../interactions/link/components.js");

      mockClient.linkAccount.mockResolvedValue(
        ok({
          success: true,
          playerId: 42,
          usernameNormalized: "playerone",
        } as LinkAccountResponse),
      );

      const callOrder: string[] = [];
      const deferReplyMock = mock(() => {
        callOrder.push("deferReply");
        return Promise.resolve();
      });
      const editReplyMock = mock(() => {
        callOrder.push("editReply");
        return Promise.resolve();
      });

      const mockInteraction = {
        customId: "link/confirm/pc?username=PlayerOne",
        user: { id: "987654321" },
        deferReply: deferReplyMock,
        deferUpdate: mock(() => Promise.resolve()),
        editReply: editReplyMock,
        context: {
          env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
          set: () => {},
          get: () => undefined,
        },
      } as unknown as MessageComponentInteraction;

      await linkButtonHandler.execute(mockInteraction);

      expect(mockClient.linkAccount).toHaveBeenCalledTimes(1);
      const rpcCall = mockClient.linkAccount.mock.calls[0];
      const rpcArg = rpcCall?.[0];
      expect(rpcArg).toBeDefined();
      if (!rpcArg) {
        return;
      }
      expect(rpcArg.discordUserId).toBe("987654321");
      expect(rpcArg.username).toBe("PlayerOne");
      expect(rpcArg.platform).toBe("pc");
      expect(rpcArg.game).toBe(Game.R6);

      expect(callOrder.indexOf("deferReply")).toBeLessThan(callOrder.indexOf("editReply"));

      const callArg = getEditPayload(editReplyMock as MockWithCalls) as { components?: unknown[] };
      const json = containerJson(callArg);
      expect(json["accent_color"]).toBe(0x22c55e);
      expect(textFromContainer(json)).toContain("playerone");
      expect(textFromContainer(json)).toContain("42");
    });

    it("shows error card on RPC failure", async () => {
      const { linkButtonHandler } = await import("../interactions/link/components.js");

      mockClient.linkAccount.mockResolvedValue(err(new ConnectError("Account not found", 5)));

      const editReplyMock = mock(() => Promise.resolve());
      const mockInteraction = {
        customId: "link/confirm/xbox?username=BadPlayer",
        user: { id: "111222333" },
        deferReply: mock(() => Promise.resolve()),
        deferUpdate: mock(() => Promise.resolve()),
        editReply: editReplyMock,
        context: {
          env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
          set: () => {},
          get: () => undefined,
        },
      } as unknown as MessageComponentInteraction;

      await linkButtonHandler.execute(mockInteraction);

      const callArg = getEditPayload(editReplyMock as MockWithCalls) as { components?: unknown[] };
      const json = containerJson(callArg);
      expect(json["accent_color"]).toBe(0xef4444);
      expect(textFromContainer(json)).toContain("Account not found");
    });
  });

  describe("linkSubmitModal", () => {
    it("shows confirmation without calling RPC", async () => {
      const { linkSubmitModal } = await import("../interactions/link/submit.js");
      const { ok } = await import("neverthrow");

      const updateMock = mock(() => Promise.resolve(ok({})));

      const mockInteraction = {
        customId: "link/submit/playstation/1514369781434945616",
        fields: {
          getString: mock((name: string) => (name === "username" ? "Alice" : null)),
        },
        update: updateMock,
        context: {
          env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
          set: () => {},
          get: () => undefined,
        },
      } as unknown as ModalInteraction;

      await linkSubmitModal.execute(mockInteraction);

      expect(updateMock).toHaveBeenCalled();
      expect(mockClient.linkAccount).not.toHaveBeenCalled();

      const updateCalls = (updateMock as MockWithCalls).mock.calls[0];
      const callArg = (updateCalls?.[0] ?? {}) as {
        components?: unknown[];
        flags?: number;
      };
      expect(callArg.flags).toBe(COMPONENTS_V2_EPHEMERAL);
      const json = containerJson(callArg);
      expect(json["accent_color"]).toBe(0xf59e0b);
      expect(textFromContainer(json)).toContain("Confirm Your Account");
      expect(textFromContainer(json)).toContain("Alice");
      expect(textFromContainer(json)).toContain("PlayStation");
    });
  });
});
