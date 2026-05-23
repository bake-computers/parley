# F2 Code Quality Review — Learnings

## Import Convention

Test files use `.js` extension imports (e.g., `import { pingCommand } from "../commands/ping.js"`).
This is Bun's convention — Bun resolves `.js` → `.ts` at runtime. LSP reports these as "cannot find module"
errors, but `bun test` handles them correctly (22/22 pass). This is an LSP/tsserver limitation, not a code issue.

## Embed Color Convention

All embed colors are centralized in `embeds.ts` as named constants:
- `EMBED_SUCCESS_COLOR = 0x22C55E` (green)
- `EMBED_ERROR_COLOR = 0xEF4444` (red)
- `EMBED_INFO_COLOR = 0xFFFFFF` (white)
- `EMBED_WARNING_COLOR = 0xF59E0B` (amber)

These match DESIGN.md spec. Commands use the factory functions (`createSuccessEmbed`, etc.) rather than
hardcoding colors. The only exception is `help.ts` which uses `0xffffff` directly in an inline
`new EmbedBuilder()` call — still matches the info color spec but bypasses the factory pattern for brevity.

## Type System Gaps

The transport layer (`transport.ts`) uses `as never` to coerce ConnectRPC service types into
`createClient()`. This propagates type unsafety to command files which then need their own casts
(`as IdentityClient`, `as unknown as IdentityClient`). Root cause: client cache returns `Map<string, unknown>`
and the generic type isn't preserved. A proper fix would make `getIdentityClient` return a typed client.

## Non-null Assertion Pattern

`.getString("name", true)!` is redundant — the second arg `true` already guarantees non-null return.
The `!` is both unnecessary and flagged by oxlint `no-non-null-assertion`. Removing it is trivial.
