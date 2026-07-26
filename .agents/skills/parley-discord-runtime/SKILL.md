---
name: parley-discord-runtime
description: Use when adding/editing Discord slash commands, components, or modals; building Components v2 messages (Container, Section, TextDisplay, Separator); making outbound Discord REST calls; understanding the Ed25519 signature check; or wiring command registration/deploy in the Parley monorepo.
---

# Parley Discord Runtime

## Overview

`@parley/runtime` is a type-safe wrapper over Discord's API: builders for Components v2 (Container, Section, TextDisplay, Separator), a `ParleyClient` Hono-compatible fetch handler, Ed25519 signature verification, and a `DiscordRestClient` for outbound calls. The Worker (`apps/worker`) mounts the client and provides `ui/` helpers like `replyV2`.

## Quick reference

| Action                   | Location / function                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Define a slash command   | `apps/worker/src/interactions/<name>/` (slash, components, modals as needed; simple cmds may be a single file) |
| Runtime handler list     | `apps/worker/src/handlers.ts` — export `workerHandlers`                                                        |
| Mount handlers           | `apps/worker/src/app.ts` — thin `createApp()`: `client.loadHandlers(...workerHandlers)`                        |
| Register with Discord    | `apps/worker/src/register-commands.ts` — slash list + `registerApplicationCommands` from `@parley/runtime`     |
| Components v2 top-level  | `ContainerBuilder` (`packages/runtime/src/builders/container.ts`)                                              |
| Send a v2 message        | `replyV2(interaction, container, ephemeral)` from `apps/worker/src/ui/discord.ts`                              |
| Outbound Discord REST    | `DiscordRestClient` from `@parley/runtime`; token `env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN`                 |
| Signature verification   | Automatic in `ParleyClient.fetch` via `verifyDiscordRequest` (Ed25519)                                         |
| Push commands to Discord | `bun run register-commands` from `apps/worker` (needs `DISCORD_BOT_TOKEN` + `DISCORD_APPLICATION_ID`)          |
| Deploy the worker        | `cd apps/worker && bun run deploy` (Wrangler)                                                                  |

## Critical patterns

**Two-file wiring for every slash command.** Each new or renamed slash command must be added in **two** places: `handlers.ts` (runtime handler list) and `register-commands.ts` (Discord registration). `app.ts` only loads `workerHandlers` — do not wire commands inline there. Missing `handlers.ts` → Discord invokes but runtime errors with "no handler". Missing `register-commands.ts` → Discord never sees the new definition. Component/modal/button handlers go in `handlers.ts` only (they are not slash-registered). Treat `register-commands.ts` as the source of truth for the slash list.

**Components v2 wraps everything in a `ContainerBuilder`.** A v2 message is `components: [container]`, not a flat list. `replyV2` (in `apps/worker/src/ui/discord.ts`) wraps the container and posts using the interaction token. From inside a handler, always reply via `replyV2` — don't call `discordRequest` for the initial response.

**Two transports — don't mix them.** `apps/worker/src/transport.ts` is the **ConnectRPC transport to the Go engine** (use `getXxxClient(env)` per the proto-contracts skill). For **Discord REST** use `DiscordRestClient` from `@parley/runtime`. The `ParleyClient` builds a rest instance per request from `env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN`.

**Two-step deploy: register, then push.** Changing the `SlashCommand` definition does not update Discord from `wrangler deploy`. Flow: (1) `cd apps/worker && bun run register-commands` PUTs the command list, (2) `bun run deploy` pushes the handler code. `register-commands` is a one-shot Bun script, not a Worker route.

## Common mistakes

- Adding a command to `handlers.ts` but not `register-commands.ts` (or vice versa) — silent until users try the command
- Wiring handlers only in `app.ts` — that file is a thin mount; put handlers in `handlers.ts`
- Calling `discordRequest` directly for the initial reply — use `replyV2`
- Flattening Components v2 (`components: [textDisplay, button]`) — Discord rejects it; wrap in `ContainerBuilder`
- Mistaking `apps/worker/src/transport.ts` for Discord REST — it's the ConnectRPC engine transport
- Renaming a command and deploying without re-running `register-commands` — Discord keeps the old name

## See also

- `README.md` §5.3, §7 — Worker architecture and request lifecycle
- `packages/runtime/src/index.ts` — full export surface
- `apps/worker/src/handlers.ts` + `apps/worker/src/register-commands.ts` — canonical two-file wiring
- `parley-proto-contracts` skill — for the engine-side RPC contract
