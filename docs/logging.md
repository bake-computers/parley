# JSON Logging

All touched runtime, registration, cache, and queue paths log single-line JSON records.

## Shape

```json
{
  "timestamp": "2026-04-25T12:00:00.000Z",
  "level": "info",
  "event": "discord.command.registered",
  "message": "Registered Discord commands",
  "requestId": "abc",
  "interactionId": "123",
  "commandName": "stats",
  "error": {
    "name": "Error",
    "message": "example"
  }
}
```

`error` values are serialized safely and include `name`, `message`, and `stack` when available.

## Common Events

- `discord.command.registered`
- `discord.request.invalid`
- `discord.interaction.failed`
- `discord.command.handler_failed`
- `stats.refresh.queued`
- `stats.refresh.deduped`
- `stats.refresh.scrape_failed`
- `stats.refresh.completed`
- `worker.scheduled.health`

Use `logger.info`, `logger.warn`, or `logger.error` from `src/lib/logger.ts`; do not add ad hoc console logging in command or queue paths.
