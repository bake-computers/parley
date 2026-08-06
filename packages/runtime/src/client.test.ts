import type { ExecutionContext } from "@cloudflare/workers-types";
import { describe, expect, test } from "bun:test";
import { ParleyClient, SlashCommand } from "./index.js";

type WaitUntilContext = Pick<ExecutionContext, "waitUntil">;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), milliseconds);
  });
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedInteraction(name: string): Promise<{
  request: Request;
  publicKey: string;
}> {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as unknown as CryptoKeyPair;
  const publicKey = toHex(new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey)));
  const body = JSON.stringify({
    type: 2,
    id: "interaction",
    application_id: "app",
    token: "token",
    version: 1,
    data: { id: "command", name, type: 1, options: [] },
    guild_id: "guild",
    channel: { id: "channel" },
    member: { user: { id: "user" } },
  });
  const timestamp = String(Date.now());
  const signature = toHex(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: "Ed25519" },
        keyPair.privateKey,
        new TextEncoder().encode(timestamp + body),
      ),
    ),
  );

  return {
    request: new Request("https://example.test/", {
      method: "POST",
      body,
      headers: {
        "x-signature-timestamp": timestamp,
        "x-signature-ed25519": signature,
      },
    }),
    publicKey,
  };
}

function executionContext(waited: Promise<unknown>[]): ExecutionContext {
  const context: WaitUntilContext = {
    waitUntil(promise) {
      waited.push(promise);
    },
  };
  return context as ExecutionContext;
}

describe("ParleyClient interaction acknowledgements", () => {
  test("automatically defers a slow command and edits the deferred reply", async () => {
    const waited: Promise<unknown>[] = [];
    const calls: Array<{ url: string; method: string }> = [];
    const fetcher = Object.assign(
      (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
        calls.push({ url: String(input), method: init?.method ?? "GET" });
        return Promise.resolve(Response.json({ ok: true }));
      },
      { preconnect() {} },
    ) as typeof fetch;
    const client = new ParleyClient({ fetcher });
    client.loadHandlers(
      new SlashCommand()
        .setName("slow")
        .setDescription("Slow command")
        .addHandler(async (interaction) => {
          await delay(400);
          await interaction.reply("done");
        }),
    );

    const signed = await signedInteraction("slow");
    const response = await client.fetch(
      signed.request,
      { DISCORD_PUBLIC_KEY: signed.publicKey },
      executionContext(waited),
    );

    expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } });
    expect(calls).toEqual([]);

    await Promise.all(waited);
    expect(calls).toEqual([
      {
        url: "https://discord.com/api/v10/webhooks/app/token/messages/@original",
        method: "PATCH",
      },
    ]);
  });

  test("captures a fast editReply as the initial response", async () => {
    const waited: Promise<unknown>[] = [];
    const calls: string[] = [];
    const fetcher = Object.assign(
      (input: string | Request | URL): Promise<Response> => {
        calls.push(String(input));
        return Promise.resolve(Response.json({ ok: true }));
      },
      { preconnect() {} },
    ) as typeof fetch;
    const client = new ParleyClient({ fetcher });
    client.loadHandlers(
      new SlashCommand()
        .setName("fast")
        .setDescription("Fast command")
        .addHandler(async (interaction) => {
          await interaction.editReply({ content: "done" });
        }),
    );

    const signed = await signedInteraction("fast");
    const response = await client.fetch(
      signed.request,
      { DISCORD_PUBLIC_KEY: signed.publicKey },
      executionContext(waited),
    );

    expect(await response.json()).toEqual({
      type: 4,
      data: { content: "done" },
    });
    expect(calls).toEqual([]);
  });
});
