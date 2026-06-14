# User Settings Command & Acceptance Gate

**Status:** design — pending review
**Date:** 2026-06-13
**Cycle:** A only (per scope split; B = i18n of all existing commands = future cycle)

## Summary

Ship a `/user` Discord slash command that lets each user manage their own
preferences — language, matchmaking opt-out, profile visibility, timezone —
plus a one-time privacy/terms acceptance gate that blocks every bot
interaction until accepted. Roll out a unified three-color design system
(graphite silver main, orange warning, red error) and remove the
`-# Parley` footer from every card across the bot.

## Out of scope (deferred)

- Translating existing command strings into the resolved language.
  Plumbing a `t()` helper and string catalogs across all commands is its
  own design cycle.
- Re-prompting users to re-accept when terms/privacy change. A future
  cycle will add a `terms_version` field and a re-acceptance flow.

## Design decisions (from brainstorm)

- **Scope:** A this cycle, B next.
- **Layout:** single settings card with inline accessory buttons + select
  menus, no footer. (Mockup A from the brainstorm session.)
- **Acceptance gate:** explicit per-handler `assertAccepted()` call.
  Single-click `Accept & Continue` button. One-time per Discord user.
- **Color system:** globally applied this cycle.
- **Main color:** graphite silver `#8A8A8E`.
- **Warning color:** amber `#F59E0B`.
- **Error color:** red `#EF4444`.
- **Footer:** removed from every card this cycle.
- **Features on `/user` card:** language, matchmaking toggle, profile
  visibility, timezone, stats refresh button, delete-my-data flow,
  cooldown status display.

## Component map

| Component                                                              | Path   | Purpose                                                                                      |
| ---------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `apps/worker/src/ui/tokens.ts`                                         | new    | Single source of `UI_TOKENS = { main, warning, error }`.                                     |
| `apps/worker/src/interactions/_shared/acceptance.ts`                   | new    | `assertAccepted()` middleware helper.                                                        |
| `apps/worker/src/interactions/_shared/stats.ts`                        | new    | Shared `executeFetchStats` (extracted from `link/rpc.ts`).                                   |
| `apps/worker/src/interactions/user/`                                   | new    | Slash + components + modal + rpc + ui + constants.                                           |
| `apps/worker/src/interactions/help.ts`                                 | edit   | Convert to Components v2 container with graphite accent.                                     |
| `apps/worker/src/interactions/ping.ts`                                 | edit   | Return a one-line graphite container.                                                        |
| `apps/worker/src/interactions/profile.ts`                              | edit   | Drop footer; swap to graphite; call `assertAccepted` first.                                  |
| `apps/worker/src/interactions/link/{constants,ui,slash,components}.ts` | edit   | Drop footer; swap color tokens; call `assertAccepted` first.                                 |
| `apps/worker/src/embeds.ts`                                            | delete | Legacy `create*Embed` helpers. Replaced by `ui/tokens.ts` + Components v2.                   |
| `apps/worker/src/app.ts`                                               | edit   | Register `userSlashCommand`, `userButtonHandler`, `userModalHandler`, `acceptButtonHandler`. |
| `apps/worker/src/register-commands.ts`                                 | edit   | Include `userSlashCommand` in command list.                                                  |
| `apps/worker/src/transport.ts`                                         | edit   | Add `getUserSettingsClient` factory for `UserSettingsService`.                               |
| `proto/user/v1/user.proto`                                             | edit   | Add fields 5/6/7 to `UserSettings`.                                                          |
| `migrations/2026-06-13-XXXXXX_user_settings_extend/`                   | new    | Adds 3 columns to `user_settings`.                                                           |
| `src/db/schema.rs`                                                     | edit   | Mirror the 3 new columns in the Diesel table.                                                |
| `src/db/models.rs`                                                     | edit   | Add fields to `UserSettings`/`NewUserSettings`.                                              |
| `src/db/repos.rs`                                                      | edit   | Read/write new columns in `UserSettingsRepo`.                                                |
| `src/handlers/user_settings.rs`                                        | edit   | `row_to_proto` + `NewUserSettings` constructor.                                              |
| `packages/generated-ts/src/index.ts`                                   | edit   | Re-export `./user/v1/user_pb.js`.                                                            |
| `apps/worker/src/transport.ts`                                         | edit   | Resolve `UserSettingsService` client.                                                        |
| `.gitignore`                                                           | edit   | Add `.superpowers/`.                                                                         |

## Data model

### Proto delta

```proto
message UserSettings {
  string discord_user_id              = 1;
  parley.common.v1.Language language  = 2;
  int64  updated_at_ms                = 3;
  bool   matchmaking_enabled          = 4;
  int64  terms_accepted_at_ms         = 5;  // 0 = not yet accepted
  bool   profile_public               = 6;  // default true
  string timezone                     = 7;  // IANA, default "UTC", max 64
}
```

### Migration

```sql
ALTER TABLE user_settings
    ADD COLUMN terms_accepted_at_ms bigint  NOT NULL DEFAULT 0,
    ADD COLUMN profile_public        boolean NOT NULL DEFAULT true,
    ADD COLUMN timezone              text    NOT NULL DEFAULT 'UTC';
```

`down.sql` reverses with `DROP COLUMN`. Existing rows default to
`terms_accepted_at_ms=0` which the worker treats as "not accepted" and
prompts the gate on next interaction — backfill is automatic.

### Engine handler

`UserSettingsRepo::get` returns the row or `None`. `row_to_proto` now
maps the three new fields. `NewUserSettings` constructor takes them.
`UpsertUserSettings` propagates whatever the client sent, so a partial
update (e.g. only `matchmaking_enabled`) is fine.

## `/user` command flow

```
/user
  ↓
assertAccepted → (passes)
  ↓
deferReply (ephemeral)
  ↓
GetUserSettings(discord_user_id)
  ↓
buildSettingsCard(settings, emojis)
  ↓
editReply(card)
```

### Card layout

```
[ ⚙️  Your Settings ]                          accent: graphite
  Language  ·  Matchmaking  ·  Visibility  ·  Timezone  ·  Cooldown
  ─────────
  Language:     English ▾            [StringSelect: en | de]
  Matchmaking:  ● Enabled   [On] [Off]
  Visibility:   Public     [Public] [Hidden]
  Timezone:     Europe/Berlin ▾       [StringSelect: 12 IANA]
  ─────────
  Cooldown:     none
                — or —
                expires <discord timestamp>
  ─────────
  [🔄 Refresh stats]   [🗑️ Delete my data…]
```

No footer.

### Custom IDs

| Custom ID                | Action                    |
| ------------------------ | ------------------------- |
| `user/lang/en`           | Set language to English   |
| `user/lang/de`           | Set language to Deutsch   |
| `user/matchmaking/on`    | Enable matchmaking        |
| `user/matchmaking/off`   | Disable matchmaking       |
| `user/visibility/public` | Public profile            |
| `user/visibility/hidden` | Hidden profile            |
| `user/timezone/{iana}`   | Set timezone              |
| `user/refresh-stats`     | Trigger stats fetch       |
| `user/delete/open`       | Open delete-confirm modal |
| `user-delete-modal`      | Modal `custom_id`         |
| `user/accept-terms`      | Acceptance button         |

### Timezone list (curated, 12 options)

UTC, US/Pacific, US/Mountain, US/Central, US/Eastern, Europe/London,
Europe/Berlin, Europe/Madrid, Europe/Athens, Asia/Dubai, Asia/Tokyo,
Australia/Sydney. Stored as IANA names, displayed as `City/Region`.

### Delete flow

1. User clicks `🗑️ Delete my data…`.
2. Handler opens a modal with one TextInput: "Type your Discord
   username to confirm".
3. Submit handler calls `DeleteUserData`. If `success=false` → error
   card. If `success=true` → result card with:
   - `tables_affected` rendered as a bullet list
   - `cooldown_until_ms` rendered as Discord dynamic timestamp
   - "Your records are anonymized. You may re-link a new account after
     the cooldown ends."

### Stats refresh

`user/refresh-stats` calls `executeFetchStats` for the user's linked
account (if any). Reuses the same `FetchStatsResponse` rendering path as
the link wizard. On no-link: info card. On RPC error: warning card.

## Acceptance gate flow

```
any command (link, profile, user, help, ping)
  ↓
assertAccepted(interaction, env)
  ↓
GetUserSettings cached in context (30s TTL)
  ↓
if terms_accepted_at_ms == 0:
  reply ephemeral acceptance card
  return false
else:
  return true
```

### Acceptance card

```
[ 🛡️  Before you start ]                       accent: graphite
  Parley links your Discord to your in-game profile and stores
  match, stats, and tournament data so we can run ranked queues
  and tournaments.

  By continuing you accept our
  [Privacy Policy](https://parley.bot/privacy) and
  [Terms of Service](https://parley.bot/terms).

  [Accept & Continue]
```

`Accept & Continue` click → `UpsertUserSettings({terms_accepted_at_ms: now})` →
edit the deferred card to a confirmation: "✅ Accepted. Please re-run
your command." User re-invokes; the gate now passes.

### Gate exemptions

- `/help` and `/ping` are read-only; no data is created or read. They
  bypass the gate so users can read the docs before accepting.
- DMs are gated identically to guilds.
- Acceptance is per Discord user (global), not per guild.

## Color + footer rollout

- `ui/tokens.ts` exports `UI_TOKENS = { main: 0x8A8A8E, warning: 0xF59E0B, error: 0xEF4444 }`.
- `link/constants.ts` imports from `ui/tokens.ts`; drops `UI_SUCCESS_COLOR` and `UI_INFO_COLOR`.
- `link/ui.ts` swaps every `setAccentColor(UI_INFO_COLOR)` to
  `UI_TOKENS.main`. `UI_SUCCESS_COLOR` containers also become
  `UI_TOKENS.main` (success = default accent).
- All `footerDisplay()` calls removed from `link/ui.ts` and any other
  helper that renders it.
- `help.ts` and `ping.ts` re-built as Components v2 containers with
  graphite accent and no footer.
- `embeds.ts` deleted; all callers now use the runtime `ContainerBuilder`
  directly.

## Caching

`GetUserSettings` is called twice per interaction at most (once for the
gate, once for the card). Cache the result in
`interaction.context` under key `user-settings-cache:<discordUserId>`
with a 30-second TTL. The 30s window is short enough that a settings
change in one channel is visible in another within 30s, and long
enough that a multi-handler wizard (link's three clicks) only does one
RPC.

## Error handling

- Empty `discord_user_id` from interaction → fail-open (let command run,
  log a warning). Avoids bricking users in pathological Discord edge
  cases.
- Engine RPC failure during `assertAccepted` → fail-open + WARN log
  `user_settings.fetch_failed`. Reason: don't block all bot usage when
  the engine is degraded.
- Engine RPC failure during `/user` command → error card with the
  engine error message, no silent swallow.
- Missing field on settings response → render with default (empty
  string, `cooldown_until_ms=0` = "none").
- Stats refresh failure → warning card, doesn't break the rest of the
  settings card.

## Testing

| Test                                                   | Layer                                                | Type                   |
| ------------------------------------------------------ | ---------------------------------------------------- | ---------------------- |
| `language_mapping_round_trip` extended with new fields | `src/handlers/user_settings.rs`                      | unit                   |
| `terms_accepted_default_zero`                          | `src/handlers/user_settings.rs`                      | unit                   |
| `upsert_persists_new_columns`                          | `src/db/repos.rs`                                    | integration (needs DB) |
| `get_returns_defaults_for_new_columns`                 | `src/db/repos.rs`                                    | integration            |
| `migration_roundtrip`                                  | existing                                             | integration (auto)     |
| `invokeUpsertSettings` ok/err                          | `apps/worker/src/interactions/user/rpc.ts`           | unit                   |
| `invokeDeleteData` cooldown present                    | `apps/worker/src/interactions/user/rpc.ts`           | unit                   |
| `acceptButton_click_upserts_and_swaps_card`            | `apps/worker/src/interactions/user/components.ts`    | unit                   |
| `deleteButton_opens_modal`                             | `apps/worker/src/interactions/user/components.ts`    | unit                   |
| `assertAccepted_blocks_when_unaccepted`                | `apps/worker/src/interactions/_shared/acceptance.ts` | unit                   |
| `assertAccepted_fails_open_on_rpc_error`               | `apps/worker/src/interactions/_shared/acceptance.ts` | unit                   |
| `buildSettingsCard_has_no_footer`                      | `apps/worker/src/interactions/user/ui.ts`            | unit                   |

TDD: red test first, then impl, then green, then refactor.

## Verification gates (before completion)

- `cargo fmt && oxfmt .` clean.
- `cargo clippy -- -D warnings && oxlint` clean.
- `cargo test` green.
- `bun run test` green.
- `bun run typecheck` green.
- One full end-to-end run: invite the worker to a test guild, run `/user`
  as a fresh user, walk through every card state, verify the gate blocks
  then unblocks after acceptance.

## Migration plan

Single migration, applied at boot when `RUN_MIGRATIONS=1`. Default
column values backfill existing rows automatically (terms_accepted_at_ms
defaults to 0 = "prompt the gate on next interaction", which is the
intended behavior). No data loss.

## Open questions

None blocking. Two nice-to-haves for a follow-up cycle:

- `terms_version` field so future policy revisions can re-prompt.
- A `/user export` companion that returns the user's data as JSON
  before deletion.

## Risks

- `account_deletion_cooldowns` uses a hashed `discord_user_id_hash`; the
  worker never has the raw id after deletion. A user who deletes and
  re-links gets a brand-new `discord_identities` row but is still
  blocked by the cooldown hash. This is already the designed behavior;
  no change needed.
- The acceptance gate is not a Terms-of-Service-grade consent record
  (no IP, no timestamp from a trusted clock beyond the engine's
  `now_ms()`). For a production launch, a real audit log table is
  warranted in a follow-up cycle.

## Application emoji catalog

The Discord application has exactly 13 registered emojis (replacing the
previous 18). All UI must use only these — no unicode fallbacks in
shipped code:

| Name             | Replaces         | Used for                                       |
| ---------------- | ---------------- | ---------------------------------------------- |
| `warning_orange` | ⚠️               | Warning cards, refresh errors                  |
| `trash`          | 🗑️ (default)     | Non-destructive trash affordances              |
| `trash_red`      | 🗑️ (destructive) | Delete-data button + result card               |
| `timeout`        | ⏳ ⏱️            | "Wait" cards (stats fetching)                  |
| `time`           | 🕐               | Timezone, time-of-day                          |
| `reload`         | 🔄               | Refresh / re-fetch                             |
| `redirect`       | ↪️ ✅            | Continue / next step / confirm                 |
| `pin`            | 📌 🛡️ ⚙️         | Personal/pinned/your-settings; acceptance card |
| `linked`         | 🔗               | Linked account, link success                   |
| `global`         | 🌐               | Global / worldwide                             |
| `calendar`       | 📅               | Dates, schedule                                |
| `ban_hammer`     | 🚫               | Blocked / denied / error                       |
| `ban_hammer_red` | 🚫 (destructive) | Destructive error / fatal error                |

UI titles that previously had a unicode emoji (⚙️ settings, 🛡️
acceptance, ❌ error) now use `pin` (for personal/yours) and
`ban_hammer_red` (for error) with the appropriate accent color.

### Runtime change

`packages/runtime/src/utils/emojis.ts` updates `APP_EMOJI_NAMES` from the
old 18 entries to the new 13. `isAppEmojiName` and
`normalizeApplicationEmojiCatalog` automatically pick up the new list.

### Resolver wiring

`apps/worker/src/ui/emojis.ts` currently returns an empty catalog
fallback. Update to call `resolveApplicationEmojiCatalog(env)` from the
runtime (KV-backed, 6h TTL), passing the worker's `KV` binding and a
`DiscordRestClient` constructed from `env.DISCORD_BOT_TOKEN`. Cached in
`interaction.context` per the existing pattern.
