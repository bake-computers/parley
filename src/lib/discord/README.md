# Local Discord Runtime

This directory replaces the external Honocord package with a project-owned Discord interactions runtime.

## Runtime

`DiscordBot` exposes a native Worker-facing API:

```ts
const bot = new DiscordBot();
bot.loadHandlers(pingCommand, statsCommand);

export default {
  fetch: (request, env, ctx) => bot.fetch(request, env, ctx),
};
```

It handles `POST /` and `POST /interactions`, verifies Discord Ed25519 signatures, and responds to Discord ping checks. Command work is processed through `ctx.waitUntil`; handlers should call `deferReply` before doing slow work.

## Commands

```ts
export const pingCommand = new SlashCommand()
  .setName("ping")
  .setDescription("Check bot latency")
  .addHandler(async (interaction) => {
    await interaction.reply("Pong!");
  });
```

`SlashCommand`, `ContextCommand`, `ComponentHandler`, `ModalHandler`, and `WebhookEventHandler` cover the local handler surface. Builders intentionally cover the project’s current needs and common Discord component patterns, not the full Discord.js builder API.

## Responses

Interaction response helpers return `neverthrow` results:

- `reply`
- `deferReply`
- `editReply`
- `followUp`
- `deleteReply`
- `update`
- `showModal`

Command handlers may ignore the result for simple responses; the runtime logs failed Discord API calls as JSON.

## Unsupported

The old Honocord Hono adapter and cache adapter system are not ported. Multipart attachment uploads are not implemented because the app does not use them.
