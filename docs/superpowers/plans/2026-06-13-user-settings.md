# /user Settings Command & Acceptance Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/user` Discord slash command for per-user preferences (language, matchmaking toggle, profile visibility, timezone, stats refresh, delete-my-data with 30d cooldown) and a one-time privacy/terms acceptance gate that blocks every bot interaction until accepted. Roll out a three-color design system (graphite silver, orange warning, red error) and remove the `-# Parley` footer from every card.

**Architecture:** Slash command + Component handlers + Modal for destructive confirm. New fields on the existing `UserSettings` proto (3 new columns) flow through the existing `UserSettingsService`. A `assertAccepted()` helper is called as the first line of every gated handler; the helper itself calls `GetUserSettings` and short-circuits with an ephemeral card if the user has not accepted. Color tokens centralized in `apps/worker/src/ui/tokens.ts`; `embeds.ts` deleted; existing helpers updated to use Components v2 containers.

**Tech Stack:** Rust (engine, Diesel-async, protox, ConnectRPC), TypeScript (Cloudflare Workers, Hono, `@parley/runtime` Components v2, `@parley/proto` ConnectRPC clients, `neverthrow`, `discord-api-types/v10`), `bun test`, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-06-13-user-settings-design.md`

---

## File Map

| Path                                                      | Action | Responsibility                                                     |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `packages/runtime/src/utils/emojis.ts`                    | edit   | Replace `APP_EMOJI_NAMES` with 13 new names                        |
| `apps/worker/src/ui/emojis.ts`                            | edit   | Wire `resolveEmojis` to runtime KV-backed resolver                 |
| `proto/user/v1/user.proto`                                | edit   | Add 3 fields to `UserSettings`                                     |
| `packages/generated-ts/src/index.ts`                      | edit   | Re-export `./user/v1/user_pb.js`                                   |
| `migrations/2026-06-13-120000_user_settings_extend/`      | create | 3 new columns                                                      |
| `src/db/schema.rs`                                        | edit   | Mirror the 3 new columns                                           |
| `src/db/models.rs`                                        | edit   | Add fields to `UserSettings` + `NewUserSettings`                   |
| `src/db/repos.rs`                                         | edit   | Persist + read new columns in `UserSettingsRepo`                   |
| `src/handlers/user_settings.rs`                           | edit   | `row_to_proto` + `NewUserSettings` constructor + 2 new tests       |
| `apps/worker/src/ui/tokens.ts`                            | create | `UI_TOKENS` const                                                  |
| `apps/worker/src/embeds.ts`                               | delete | —                                                                  |
| `apps/worker/src/interactions/link/constants.ts`          | edit   | Drop `UI_SUCCESS/INFO_COLOR`; re-export from `tokens.ts`           |
| `apps/worker/src/interactions/link/ui.ts`                 | edit   | Drop `footerDisplay`; swap color tokens; remap to 13 app emojis    |
| `apps/worker/src/interactions/help.ts`                    | edit   | Components v2 container, graphite accent                           |
| `apps/worker/src/interactions/ping.ts`                    | edit   | Components v2 one-liner, graphite accent                           |
| `apps/worker/src/interactions/profile.ts`                 | edit   | Add `assertAccepted` call, drop footer, swap color, use app emojis |
| `apps/worker/src/interactions/link/slash.ts`              | edit   | Add `assertAccepted` call                                          |
| `apps/worker/src/interactions/link/components.ts`         | edit   | Add `assertAccepted` call                                          |
| `apps/worker/src/transport.ts`                            | edit   | Add `getUserSettingsClient`                                        |
| `apps/worker/src/interactions/_shared/acceptance.ts`      | create | `assertAccepted()` + acceptance card builder                       |
| `apps/worker/src/interactions/_shared/acceptance.test.ts` | create | 3 unit tests                                                       |
| `apps/worker/src/interactions/_shared/stats.ts`           | create | Shared `executeFetchStats`                                         |
| `apps/worker/src/interactions/link/rpc.ts`                | edit   | Re-export `executeFetchStats` from `_shared/stats`                 |
| `apps/worker/src/interactions/user/constants.ts`          | create | UI tokens, custom IDs, label maps, app-emoji names                 |
| `apps/worker/src/interactions/user/ui.ts`                 | create | Card builders using 13 app emojis                                  |
| `apps/worker/src/interactions/user/ui.test.ts`            | create | Snapshot + no-footer tests                                         |
| `apps/worker/src/interactions/user/rpc.ts`                | create | Engine client wrappers                                             |
| `apps/worker/src/interactions/user/rpc.test.ts`           | create | Unit tests                                                         |
| `apps/worker/src/interactions/user/modal.ts`              | create | Delete confirm modal                                               |
| `apps/worker/src/interactions/user/components.ts`         | create | Component handler for buttons + select menus + modal               |
| `apps/worker/src/interactions/user/components.test.ts`    | create | Unit tests                                                         |
| `apps/worker/src/interactions/user/slash.ts`              | create | `/user` slash command                                              |
| `apps/worker/src/interactions/user/index.ts`              | create | Re-exports                                                         |
| `apps/worker/src/app.ts`                                  | edit   | Register user handlers + accept button                             |
| `apps/worker/src/register-commands.ts`                    | edit   | Add `userSlashCommand` to registration list                        |

---

## Task 0: Replace app emoji catalog + wire resolver

**Files:**

- Edit: `packages/runtime/src/utils/emojis.ts:13-31` (`APP_EMOJI_NAMES` const)
- Edit: `apps/worker/src/ui/emojis.ts:1-21` (`resolveEmojis` body)
- Edit: `apps/worker/src/index.ts` (env type — may need to add DISCORD_BOT_TOKEN/KV types)

- [ ] **Step 1: Replace APP_EMOJI_NAMES in the runtime**

In `packages/runtime/src/utils/emojis.ts`, replace lines 13-31:

```ts
export const APP_EMOJI_NAMES = [
  "home",
  "fire",
  "flame",
  "search",
  "timer",
  "tool",
  "strong",
  "diamond",
  "letter",
  "link",
  "question_mark",
  "minus",
  "plus",
  "cancel",
  "confirm",
  "warning",
  "external_link",
  "information",
] as const;
```

with the 13 new names:

```ts
export const APP_EMOJI_NAMES = [
  "warning_orange",
  "trash",
  "trash_red",
  "timeout",
  "time",
  "reload",
  "redirect",
  "pin",
  "linked",
  "global",
  "calendar",
  "ban_hammer",
  "ban_hammer_red",
] as const;
```

- [ ] **Step 2: Wire resolveEmojis to the runtime resolver**

Replace the body of `apps/worker/src/ui/emojis.ts` with:

```ts
import {
  resolveApplicationEmojiCatalog,
  type ApplicationEmojiCatalog,
  type DiscordRequestContext,
} from "@parley/runtime";

const EMOJI_CONTEXT_KEY = "application-emojis";

type EmojiEnv = {
  KV?: KVNamespace;
  DISCORD_BOT_TOKEN?: string;
};

type EmojiInteraction = {
  context: DiscordRequestContext;
};

export async function resolveEmojis(
  interaction: EmojiInteraction,
): Promise<ApplicationEmojiCatalog> {
  const cached = interaction.context.get<ApplicationEmojiCatalog>(EMOJI_CONTEXT_KEY);
  if (cached) {
    return cached;
  }

  const env = interaction.context.env as EmojiEnv;
  const token = env.DISCORD_BOT_TOKEN;
  const kv = env.KV;
  if (!token || !kv) {
    interaction.context.set(EMOJI_CONTEXT_KEY, {});
    return {};
  }

  const catalog =
    (await resolveApplicationEmojiCatalog({
      token,
      kv,
    })) ?? {};
  interaction.context.set(EMOJI_CONTEXT_KEY, catalog);
  return catalog;
}
```

The runtime's `resolveApplicationEmojiCatalog` handles the KV cache + REST fetch + normalization internally.

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/juwen/dev/commerce/parley && bun run typecheck 2>&1 | tail -20
```

Expected: clean (or errors only at the link/ui.ts call sites that still reference the old emoji names — fixed in Task 8).

- [ ] **Step 4: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add packages/runtime/src/utils/emojis.ts apps/worker/src/ui/emojis.ts && git commit -m "feat(emojis): replace APP_EMOJI_NAMES with 13 new app emojis, wire resolver"
```

---

---

## Task 1: Add 3 fields to UserSettings proto + regen + barrel

**Files:**

- Edit: `proto/user/v1/user.proto:19-24`
- Edit: `packages/generated-ts/src/index.ts:1-13`
- Generated: `packages/generated-ts/src/user/v1/user_pb.ts` (regen)

- [ ] **Step 1: Edit the proto**

Replace the `UserSettings` message in `proto/user/v1/user.proto` (lines 19-24) with:

```proto
message UserSettings {
  string discord_user_id              = 1;
  parley.common.v1.Language language  = 2;
  int64  updated_at_ms                = 3;
  bool   matchmaking_enabled          = 4;
  int64  terms_accepted_at_ms         = 5;
  bool   profile_public               = 6;
  string timezone                     = 7;
}
```

- [ ] **Step 2: Regenerate TypeScript proto**

```bash
cd /Users/juwen/dev/commerce/parley/packages/generated-ts && bun run generate
```

Expected: `packages/generated-ts/src/user/v1/user_pb.ts` now has fields 5/6/7.

- [ ] **Step 3: Add user_pb to the barrel export**

Edit `packages/generated-ts/src/index.ts`. Insert one line after line 7:

```ts
export * from "./user/v1/user_pb.js";
```

The final file should read:

```ts
export * from "./common/v1/types_pb.js";

export * from "./stats/v1/stats_pb.js";

export * from "./guild/v1/guild_pb.js";

export * from "./identity/v1/identity_pb.js";

export * from "./matchmaking/v1/matchmaking_pb.js";

export * from "./leaderboard/v1/leaderboard_pb.js";

export * from "./tournament/v1/tournament_pb.js";

export * from "./user/v1/user_pb.js";
```

- [ ] **Step 4: Verify Rust build still succeeds (it should — proto regen is TS-side only)**

```bash
cd /Users/juwen/dev/commerce/parley && cargo build 2>&1 | tail -20
```

Expected: `Finished 'parley' profile` and no errors. (Rust embeds `.proto` at build.rs time and the three new fields are additive.)

- [ ] **Step 5: TypeScript typecheck**

```bash
cd /Users/juwen/dev/commerce/parley && bun run typecheck 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add proto/user/v1/user.proto packages/generated-ts/src/index.ts packages/generated-ts/src/user/v1/user_pb.ts && git commit -m "feat(proto): add terms_accepted_at_ms, profile_public, timezone to UserSettings"
```

---

## Task 2: Add migration for 3 new user_settings columns

**Files:**

- Create: `migrations/2026-06-13-120000_user_settings_extend/up.sql`
- Create: `migrations/2026-06-13-120000_user_settings_extend/down.sql`

- [ ] **Step 1: Create up.sql**

Write `migrations/2026-06-13-120000_user_settings_extend/up.sql`:

```sql
ALTER TABLE user_settings
    ADD COLUMN terms_accepted_at_ms bigint  NOT NULL DEFAULT 0,
    ADD COLUMN profile_public        boolean NOT NULL DEFAULT true,
    ADD COLUMN timezone              text    NOT NULL DEFAULT 'UTC';
```

- [ ] **Step 2: Create down.sql**

Write `migrations/2026-06-13-120000_user_settings_extend/down.sql`:

```sql
ALTER TABLE user_settings
    DROP COLUMN timezone,
    DROP COLUMN profile_public,
    DROP COLUMN terms_accepted_at_ms;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add migrations/2026-06-13-120000_user_settings_extend/ && git commit -m "feat(db): add terms_accepted, profile_public, timezone to user_settings"
```

---

## Task 3: Mirror 3 new columns in Diesel schema.rs

**Files:**

- Edit: `src/db/schema.rs:118-129` (the `user_settings` table block)

- [ ] **Step 1: Edit the user_settings diesel table**

In `src/db/schema.rs`, replace lines 118-129:

```rust
diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Languages;

    user_settings (discord_user_id) {
        discord_user_id -> Text,
        language -> Languages,
        created_at -> Int8,
        updated_at -> Int8,
        matchmaking_enabled -> Bool,
        terms_accepted_at_ms -> Int8,
        profile_public -> Bool,
        timezone -> Text,
    }
}
```

The new columns must be appended in the same order as the migration `ADD COLUMN` clause. The current schema (lines 118-129) is missing the last three; the replacement above matches the migration.

- [ ] **Step 2: Build to verify the schema compiles**

```bash
cd /Users/juwen/dev/commerce/parley && cargo build 2>&1 | tail -10
```

Expected: success. (Diesel codegen will refresh from the new schema; no usages yet so no breakage.)

- [ ] **Step 3: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add src/db/schema.rs && git commit -m "feat(schema): mirror new user_settings columns in diesel"
```

---

## Task 4: Extend models.rs with new fields

**Files:**

- Edit: `src/db/models.rs:167-185` (`UserSettings` + `NewUserSettings` structs)

- [ ] **Step 1: Add fields to UserSettings + NewUserSettings**

In `src/db/models.rs`, replace the existing `UserSettings` and `NewUserSettings` structs (lines 167-185) with:

```rust
#[derive(Debug, Clone, diesel::Queryable, diesel::Selectable)]
#[diesel(table_name = user_settings)]
pub struct UserSettings {
    pub discord_user_id: String,
    pub language: Language,
    pub created_at: i64,
    pub updated_at: i64,
    pub matchmaking_enabled: bool,
    pub terms_accepted_at_ms: i64,
    pub profile_public: bool,
    pub timezone: String,
}

#[derive(Debug, Clone, diesel::Insertable)]
#[diesel(table_name = user_settings)]
pub struct NewUserSettings<'a> {
    pub discord_user_id: &'a str,
    pub language: Language,
    pub created_at: i64,
    pub updated_at: i64,
    pub matchmaking_enabled: bool,
    pub terms_accepted_at_ms: i64,
    pub profile_public: bool,
    pub timezone: &'a str,
}
```

- [ ] **Step 2: Build to find every call site that needs to add the new fields**

```bash
cd /Users/juwen/dev/commerce/parley && cargo build 2>&1 | tail -40
```

Expected: compile errors pointing at `NewUserSettings { ... }` literals. The handler `user_settings.rs` has the only constructor site. Fix in Task 5.

- [ ] **Step 3: Commit (this commit intentionally breaks the build — fixes in Task 5)**

```bash
cd /Users/juwen/dev/commerce/parley && git add src/db/models.rs && git commit -m "feat(models): add terms_accepted, profile_public, timezone to UserSettings"
```

---

## Task 5: Extend UserSettingsRepo to read/write new columns

**Files:**

- Edit: `src/db/repos.rs:701-742` (`UserSettingsRepo` impl block)

- [ ] **Step 1: Extend the upsert to persist the three new fields**

In `src/db/repos.rs`, replace the `UserSettingsRepo::upsert` method (lines 716-735) with:

```rust
    pub async fn upsert(
        conn: &mut AsyncPgConnection,
        row: NewUserSettings<'_>,
    ) -> QueryResult<UserSettings> {
        let now = row.updated_at;
        let language = row.language;
        let matchmaking_enabled = row.matchmaking_enabled;
        let terms_accepted_at_ms = row.terms_accepted_at_ms;
        let profile_public = row.profile_public;
        let timezone = row.timezone;
        diesel::insert_into(user_settings::table)
            .values(&row)
            .on_conflict(user_settings::discord_user_id)
            .do_update()
            .set((
                user_settings::language.eq(language),
                user_settings::updated_at.eq(now),
                user_settings::matchmaking_enabled.eq(matchmaking_enabled),
                user_settings::terms_accepted_at_ms.eq(terms_accepted_at_ms),
                user_settings::profile_public.eq(profile_public),
                user_settings::timezone.eq(timezone),
            ))
            .returning(UserSettings::as_returning())
            .get_result(conn)
            .await
    }
```

`get` (lines 704-714) needs no change — `select(UserSettings::as_select())` automatically pulls the new columns.

- [ ] **Step 2: Build to confirm only the handler still needs updating**

```bash
cd /Users/juwen/dev/commerce/parley && cargo build 2>&1 | tail -30
```

Expected: only `src/handlers/user_settings.rs` still has the `NewUserSettings { ... }` literal that needs new fields.

- [ ] **Step 3: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add src/db/repos.rs && git commit -m "feat(repos): persist terms_accepted, profile_public, timezone on upsert"
```

---

## Task 6: Extend user_settings.rs handler + write tests for new field round-trip

**Files:**

- Edit: `src/handlers/user_settings.rs:55-62` (`row_to_proto`)
- Edit: `src/handlers/user_settings.rs:238-245` (`new_row` constructor in `upsert_user_settings_rpc`)
- Edit: `src/handlers/user_settings.rs:465-483` (test module)

- [ ] **Step 1: Write the failing tests**

Replace the `#[cfg(test)] mod tests` block at the end of `src/handlers/user_settings.rs` (lines 465-483) with:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_mapping_round_trip() {
        assert_eq!(
            proto_lang_to_db(ProtoLanguage::En as i32),
            Some(DbLanguage::En)
        );
        assert_eq!(
            proto_lang_to_db(ProtoLanguage::De as i32),
            Some(DbLanguage::De)
        );
        assert_eq!(proto_lang_to_db(0), None);
        assert_eq!(db_lang_to_proto(DbLanguage::En), ProtoLanguage::En as i32);
        assert_eq!(db_lang_to_proto(DbLanguage::De), ProtoLanguage::De as i32);
    }

    fn fake_row() -> crate::db::models::UserSettings {
        crate::db::models::UserSettings {
            discord_user_id: "u1".to_string(),
            language: DbLanguage::De,
            created_at: 1_000,
            updated_at: 2_000,
            matchmaking_enabled: false,
            terms_accepted_at_ms: 0,
            profile_public: false,
            timezone: "Europe/Berlin".to_string(),
        }
    }

    #[test]
    fn row_to_proto_carries_new_fields() {
        let p = row_to_proto(&fake_row());
        assert_eq!(p.terms_accepted_at_ms, 0);
        assert_eq!(p.profile_public, false);
    }
}
```

- [ ] **Step 2: Run the test to confirm it fails to compile (new fields don't exist on proto yet)**

```bash
cd /Users/juwen/dev/commerce/parley && cargo test --lib handlers::user_settings 2>&1 | tail -20
```

Expected: compile error — `UserSettings` (proto) has no field `terms_accepted_at_ms`. That confirms the test is meaningfully red.

- [ ] **Step 3: Extend row_to_proto to map the new fields**

In `src/handlers/user_settings.rs`, replace `row_to_proto` (lines 55-62) with:

```rust
fn row_to_proto(row: &crate::db::models::UserSettings) -> ProtoUserSettings {
    ProtoUserSettings {
        discord_user_id: row.discord_user_id.clone(),
        language: db_lang_to_proto(row.language),
        updated_at_ms: row.updated_at,
        matchmaking_enabled: row.matchmaking_enabled,
        terms_accepted_at_ms: row.terms_accepted_at_ms,
        profile_public: row.profile_public,
        timezone: row.timezone.clone(),
    }
}
```

- [ ] **Step 4: Update the default-when-no-row branch in `get_user_settings_rpc`**

In the same file, the `Ok(None) => ...` branch (around lines 140-146) currently returns:

```rust
Ok(None) => ProtoUserSettings {
    discord_user_id: req.discord_user_id,
    language: ProtoLanguage::En as i32,
    updated_at_ms: 0,
    matchmaking_enabled: true,
},
```

Replace it with:

```rust
Ok(None) => ProtoUserSettings {
    discord_user_id: req.discord_user_id,
    language: ProtoLanguage::En as i32,
    updated_at_ms: 0,
    matchmaking_enabled: true,
    terms_accepted_at_ms: 0,
    profile_public: true,
    timezone: "UTC".to_string(),
},
```

- [ ] **Step 5: Update the `new_row` constructor in `upsert_user_settings_rpc`**

In the same file, replace the `new_row` block (lines 238-245) with:

```rust
    let new_row = NewUserSettings {
        discord_user_id: &s.discord_user_id,
        language,
        created_at: now,
        updated_at: now,
        matchmaking_enabled: s.matchmaking_enabled,
        terms_accepted_at_ms: s.terms_accepted_at_ms,
        profile_public: s.profile_public,
        timezone: if s.timezone.is_empty() { "UTC" } else { &s.timezone },
    };
```

The empty-string fallback handles callers that send the default-constructed `UserSettings` (e.g. the `GetUserSettings` response sent back through `UpsertUserSettings`).

- [ ] **Step 6: Run the test, expect green**

```bash
cd /Users/juwen/dev/commerce/parley && cargo test --lib handlers::user_settings 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 7: Run the full test suite**

```bash
cd /Users/juwen/dev/commerce/parley && cargo test 2>&1 | tail -20
```

Expected: all passing. The `migration_roundtrip` test will pick up the new migration automatically.

- [ ] **Step 8: Lint + format**

```bash
cd /Users/juwen/dev/commerce/parley && cargo fmt && cargo clippy -- -D warnings 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add src/handlers/user_settings.rs && git commit -m "feat(user_settings): round-trip terms_accepted, profile_public, timezone"
```

---

## Task 7: Add UI tokens + delete legacy embeds.ts

**Files:**

- Create: `apps/worker/src/ui/tokens.ts`
- Delete: `apps/worker/src/embeds.ts`

- [ ] **Step 1: Create tokens.ts**

Write `apps/worker/src/ui/tokens.ts`:

```ts
/**
 * Bot color system. Graphite silver is the brand accent. Orange warns,
 * red errors. There is no separate success/info color — successful
 * states use the main accent.
 */
export const UI_TOKENS = {
  main: 0x8a8a8e,
  warning: 0xf59e0b,
  error: 0xef4444,
} as const;

export type UiToken = keyof typeof UI_TOKENS;
```

- [ ] **Step 2: Delete embeds.ts**

```bash
rm /Users/juwen/dev/commerce/parley/apps/worker/src/embeds.ts
```

- [ ] **Step 3: Find every importer of embeds.ts to update in later tasks**

```bash
cd /Users/juwen/dev/commerce/parley && grep -rn "from .*embeds" apps/worker/src/ 2>&1
```

Expected: only `interactions/profile.ts` imports from `../embeds.js`. That's fixed in Task 11.

- [ ] **Step 4: Typecheck (should fail at the imports we haven't fixed yet)**

```bash
cd /Users/juwen/dev/commerce/parley && bun run typecheck 2>&1 | tail -20
```

Expected: TS errors only in `interactions/profile.ts` and (in Task 8) `interactions/link/*`. Other packages clean. We fix those in their respective tasks; the build will return to green.

- [ ] **Step 5: Commit (delete + new file together)**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/ui/tokens.ts && git add -u apps/worker/src/embeds.ts && git commit -m "feat(ui): add UI_TOKENS, remove legacy embeds.ts"
```

---

## Task 8: Drop footer + swap color tokens in link/, help, ping, profile

**Files:**

- Edit: `apps/worker/src/interactions/link/constants.ts:19-22,62-66`
- Edit: `apps/worker/src/interactions/link/ui.ts:30-32, 51-52, 91, 133, 152, 172, 203-204`
- Edit: `apps/worker/src/interactions/help.ts:1-18`
- Edit: `apps/worker/src/interactions/ping.ts:1-8`
- Edit: `apps/worker/src/interactions/profile.ts:1-71`

- [ ] **Step 1: Rewrite link/constants.ts color block**

In `apps/worker/src/interactions/link/constants.ts`, replace lines 19-22:

```ts
export const UI_SUCCESS_COLOR = 0x22c55e;
export const UI_ERROR_COLOR = 0xef4444;
export const UI_INFO_COLOR = 0xffffff;
export const UI_WARNING_COLOR = 0xf59e0b;
```

with:

```ts
import { UI_TOKENS } from "../../ui/tokens.js";

export const UI_SUCCESS_COLOR = UI_TOKENS.main; // success uses the main accent
export const UI_ERROR_COLOR = UI_TOKENS.error;
export const UI_WARNING_COLOR = UI_TOKENS.warning;
```

`UI_INFO_COLOR` is removed; update link/ui.ts imports in the next step.

- [ ] **Step 2: Drop footer + drop UI_INFO_COLOR from link/ui.ts**

In `apps/worker/src/interactions/link/ui.ts`:

(a) Remove the `footerDisplay()` function and its call sites. The function is on lines 30-32. Delete all invocations: in `buildPlatformSelectCard` (line 73), `buildConfirmCard` (line 119), `buildSuccessCard` (line 141), `buildErrorCard` (line 156), `buildFetchingStatsCard` (line 179), `buildReadyToPlayCard` (line 213).

(b) Change the import on line 18-21 from:

```ts
import {
  ButtonStyle,
  CANCEL_CUSTOM_ID,
  GAME_NAME,
  PLATFORM_HINTS,
  PLATFORMS,
  UI_ERROR_COLOR,
  UI_INFO_COLOR,
  UI_SUCCESS_COLOR,
  UI_WARNING_COLOR,
  confirmCustomId,
  platformCustomId,
  platformLabel,
  type Platform,
} from "./constants.js";
```

to (drop `UI_INFO_COLOR`):

```ts
import {
  ButtonStyle,
  CANCEL_CUSTOM_ID,
  GAME_NAME,
  PLATFORM_HINTS,
  PLATFORMS,
  UI_ERROR_COLOR,
  UI_SUCCESS_COLOR,
  UI_WARNING_COLOR,
  confirmCustomId,
  platformCustomId,
  platformLabel,
  type Platform,
} from "./constants.js";
```

(c) Replace every `setAccentColor(UI_INFO_COLOR)` with `setAccentColor(UI_SUCCESS_COLOR)`. There are two: line 52 (platform picker) and line 172 (fetching-stats card). Now both are graphite, signaling "neutral info" with the main accent.

(d) Remap every emoji name reference to the 13 new app emojis:

| Old reference          | New name           | Notes                                |
| ---------------------- | ------------------ | ------------------------------------ |
| `"link"` (line 50, 70) | `"linked"`         | Link wizard header + platform button |
| `"warning"` (line 88)  | `"warning_orange"` | Confirm card header                  |
| `"confirm"` (line 108) | `"redirect"`       | Continue button accessory            |
| `"cancel"` (line 116)  | `"ban_hammer_red"` | Back/cancel button accessory         |
| `"timer"` (line 169)   | `"timeout"`        | Fetching-stats card header           |
| `"confirm"` (line 129) | `"redirect"`       | Account linked card                  |
| `"cancel"` (line 149)  | `"ban_hammer_red"` | Link-failed card header              |

Drop the `?? { name: "🔗" }` style unicode fallbacks on `setEmoji()` — the runtime's `toComponentEmoji` returns `null` when the name isn't in the catalog, and `ButtonBuilder.setEmoji` requires a non-null value. Refactor each `setEmoji(...)` call site to:

```ts
const emoji = toComponentEmoji(catalog, "linked");
const button = new ButtonBuilder()
  .setCustomId(platformCustomId(platform))
  .setLabel(platformLabel(platform))
  .setStyle(ButtonStyle.Primary);
if (emoji) button.setEmoji(emoji);
```

In `emojiOrFallback` (currently a helper at lines 34-40 of `link/ui.ts`), return `""` (empty string) when the catalog entry is missing — never a unicode fallback. The downstream titleWith pattern (`text ? `${text} **title**` : "**title**"`) drops the prefix when the helper returns empty.

- [ ] **Step 3: Rewrite help.ts as a Components v2 container**

Replace the entire contents of `apps/worker/src/interactions/help.ts` with:

```ts
import { ContainerBuilder, SlashCommand, TextDisplayBuilder } from "@parley/runtime";
import { replyV2 } from "../ui/discord.js";
import { UI_TOKENS } from "../ui/tokens.js";

export const helpCommand = new SlashCommand()
  .setName("help")
  .setDescription("List all available commands")
  .addHandler(async (interaction) => {
    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Parley Commands**"),
        new TextDisplayBuilder().setContent("**/ping** — Check if the bot is responsive"),
        new TextDisplayBuilder().setContent("**/help** — List all available commands"),
        new TextDisplayBuilder().setContent(
          "**/link** — Link your Discord account via an interactive wizard",
        ),
        new TextDisplayBuilder().setContent(
          "**/profile** — View your linked game accounts and stats",
        ),
        new TextDisplayBuilder().setContent(
          "**/user** — Manage your language, matchmaking opt-out, profile visibility, timezone, and data",
        ),
      );
    await replyV2(interaction, container, true);
  });
```

- [ ] **Step 4: Rewrite ping.ts as a Components v2 one-liner**

Replace the entire contents of `apps/worker/src/interactions/ping.ts` with:

```ts
import { ContainerBuilder, SlashCommand, TextDisplayBuilder } from "@parley/runtime";
import { replyV2 } from "../ui/discord.js";
import { UI_TOKENS } from "../ui/tokens.js";

export const pingCommand = new SlashCommand()
  .setName("ping")
  .setDescription("Check if the bot is responsive")
  .addHandler(async (interaction) => {
    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(new TextDisplayBuilder().setContent("Pong! 🏓"));
    await replyV2(interaction, container, true);
  });
```

- [ ] **Step 5: Rewrite profile.ts to drop footer + drop embeds import + add assertAccepted**

First we need the acceptance helper to exist. Tasks 9 and 10 build it. For now, write the import line but expect a typecheck error until Task 10 lands. Replace the entire contents of `apps/worker/src/interactions/profile.ts` with:

```ts
import {
  ContainerBuilder,
  SlashCommand,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
} from "@parley/runtime";
import { Game } from "@parley/proto";
import type { LinkedIdentity } from "@parley/proto";
import type { LookupByDiscordResponse } from "@parley/proto";
import { assertAccepted } from "./_shared/acceptance.js";
import { getIdentityClient, type EngineTransportEnv } from "../transport.js";
import { replyV2 } from "../ui/discord.js";
import { UI_TOKENS } from "../ui/tokens.js";
import type { Result } from "neverthrow";
import type { ConnectError } from "@connectrpc/connect";

const GAME_NAMES: Record<number, string> = {
  [Game.R6]: "Rainbow Six Siege",

};

function gameName(game: number): string {
  return GAME_NAMES[game] ?? `Game ${game}`;
}

interface IdentityClient {
  lookupByDiscord: (req: {
    discordUserId: string;
    game: number;
  }) => Promise<Result<LookupByDiscordResponse, ConnectError>>;
}

export const profileCommand = new SlashCommand()
  .setName("profile")
  .setDescription("View your linked game accounts and stats")
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env))) {
      return;
    }

    await interaction.deferReply(true);

    if (!env.ENGINE_SERVICE_URL && !env.VPC_SERVICE) {
      await interaction.editReply({
        embeds: [
          {
            title: "Configuration Error",
            description: "Engine service is not configured.",
            color: UI_TOKENS.error,
          },
        ],
      });
      return;
    }

    const client = getIdentityClient(env) as unknown as IdentityClient;
    const result = await client.lookupByDiscord({
      discordUserId: interaction.user?.id ?? "",
      game: Game.UNSPECIFIED,
    });

    if (result.isErr()) {
      await interaction.editReply({
        embeds: [
          {
            title: "Profile Lookup Failed",
            description: result.error.message,
            color: UI_TOKENS.error,
          },
        ],
      });
      return;
    }

    const { identities } = result.value;
    if (identities.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(UI_TOKENS.main)
        .addComponents(
          new TextDisplayBuilder().setContent("**No Linked Accounts**"),
          new TextDisplayBuilder().setContent("No accounts linked. Use /link to get started!"),
        );
      await replyV2({ reply: interaction.editReply.bind(interaction) }, container, true);
      return;
    }

    const lines = identities.map(
      (id: LinkedIdentity) =>
        `**${gameName(id.game)}** — ${id.username} (${id.platform}) — ELO: ${Math.round(id.internalElo)}`,
    );
    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Your Linked Accounts**"),
        new TextDisplayBuilder().setContent(lines.join("\n")),
      );
    await replyV2({ reply: interaction.editReply.bind(interaction) }, container, true);
  });
```

Note: the error paths use the legacy `embeds` shape for now because `editReply` (after `deferReply`) doesn't support Components v2 in this version of the runtime. `replyV2` requires a fresh `reply()` call. The success path uses `replyV2` against the deferred interaction. This keeps the diff small; a follow-up cycle can migrate the error paths.

- [ ] **Step 6: Typecheck (will still fail at `_shared/acceptance` until Task 10)**

```bash
cd /Users/juwen/dev/commerce/parley && bun run typecheck 2>&1 | tail -20
```

Expected: errors only at the new `assertAccepted` import line in `profile.ts`. That clears when Task 10 lands.

- [ ] **Step 7: Run link/components.test.ts to confirm the existing tests still pass with the new colors**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/link/ 2>&1 | tail -20
```

Expected: all green. The tests don't assert on color values, only structural details.

- [ ] **Step 8: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/interactions/ && git commit -m "feat(ui): drop footer, swap to graphite tokens, rewrite help+ping as V2"
```

---

## Task 9: Extract shared stats helper

**Files:**

- Create: `apps/worker/src/interactions/_shared/stats.ts`
- Edit: `apps/worker/src/interactions/link/rpc.ts:90-101, 122-130, 137-146`

- [ ] **Step 1: Create the shared helper**

Write `apps/worker/src/interactions/_shared/stats.ts`:

```ts
import type { FetchStatsResponse } from "@parley/proto/stats/v1/stats_pb.js";
import { Game, StatsPlatform } from "@parley/proto";
import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "neverthrow";
import { getStatsClient, type EngineTransportEnv } from "../../transport.js";

export type FetchStatsPlatform = "pc" | "xbox" | "playstation";

export type ExecuteFetchStatsInput = {
  context: { env: unknown };
  username: string;
  platform: FetchStatsPlatform;
};

type FetchStatsArgs = {
  username: string;
  platform: StatsPlatform;
  game: Game;
};

type StatsClient = {
  fetchStats: (req: FetchStatsArgs) => Promise<FetchStatsResponse>;
};

export function platformToStatsPlatform(platform: FetchStatsPlatform): StatsPlatform {
  switch (platform) {
    case "pc":
      return StatsPlatform.PC;
    case "xbox":
      return StatsPlatform.XBOX;
    case "playstation":
      return StatsPlatform.PLAYSTATION;
  }
}

export function executeFetchStats(
  input: ExecuteFetchStatsInput,
): Promise<Result<FetchStatsResponse, ConnectError>> {
  const env = input.context.env as EngineTransportEnv;
  const client = getStatsClient(env) as unknown as StatsClient;
  const args: FetchStatsArgs = {
    username: input.username,
    platform: platformToStatsPlatform(input.platform),
    game: Game.R6,
  };
  return invokeFetchStats(client, args);
}

export function invokeFetchStats(
  client: StatsClient,
  args: FetchStatsArgs,
): Promise<Result<FetchStatsResponse, ConnectError>> {
  return client.fetchStats(args).then(
    (response) => ok(response),
    (cause: unknown) =>
      err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
  );
}
```

- [ ] **Step 2: Replace the duplicated code in link/rpc.ts**

In `apps/worker/src/interactions/link/rpc.ts`, delete the existing `executeFetchStats`, `invokeFetchStats`, and `platformToStatsPlatform` definitions (lines 90-101, 122-130, 137-146). Replace them with a re-export:

```ts
export { executeFetchStats, invokeFetchStats, platformToStatsPlatform } from "../_shared/stats.js";
```

(Place this at the bottom of the file.)

- [ ] **Step 3: Run link rpc tests**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/link/rpc.test.ts 2>&1 | tail -20
```

Expected: all green. The tests import from `./rpc.js` and the re-exports keep the public API stable.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/juwen/dev/commerce/parley && bun run typecheck 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/interactions/_shared/stats.ts apps/worker/src/interactions/link/rpc.ts && git commit -m "refactor: extract shared stats fetcher to _shared/stats"
```

---

## Task 10: Acceptance gate helper + tests

**Files:**

- Create: `apps/worker/src/interactions/_shared/acceptance.ts`
- Create: `apps/worker/src/interactions/_shared/acceptance.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `apps/worker/src/interactions/_shared/acceptance.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ok, type Result } from "neverthrow";
import type { JsonValue, DiscordApiError } from "@parley/runtime";
import type { GetUserSettingsResponse, UserSettings as ProtoUserSettings } from "@parley/proto";
import { assertAccepted, buildAcceptanceCard, ACCEPT_BUTTON } from "./acceptance.js";

const ENV = { ENGINE_SERVICE_URL: "http://localhost:50051" };

type Reply = (options: {
  components?: unknown[];
  flags?: number;
}) => Promise<Result<JsonValue, DiscordApiError>>;

function captureReply() {
  const calls: Parameters<Reply>[0][] = [];
  const interaction = {
    user: { id: "u1" },
    reply: ((options: Parameters<Reply>[0], _force?: boolean) => {
      calls.push(options);
      return Promise.resolve(ok({} as JsonValue) as Result<JsonValue, DiscordApiError>);
    }) as unknown as Parameters<typeof assertAccepted>[0]["reply"],
  };
  return { calls, interaction: interaction as Parameters<typeof assertAccepted>[0] };
}

function userSettings(termsAcceptedAtMs: number): ProtoUserSettings {
  return {
    $typeName: "parley.user.v1.UserSettings",
    discordUserId: "u1",
    language: 1,
    updatedAtMs: 0,
    matchmakingEnabled: true,
    termsAcceptedAtMs,
    profilePublic: true,
    timezone: "UTC",
  } as unknown as ProtoUserSettings;
}

describe("assertAccepted", () => {
  test("returns true and does not reply when the user has accepted", async () => {
    const fakeClient = {
      getUserSettings: () =>
        Promise.resolve({
          success: true,
          settings: userSettings(Date.now()),
        } as unknown as GetUserSettingsResponse),
    };
    const { calls, interaction } = captureReply();
    const result = await assertAccepted(interaction, ENV, fakeClient as never);
    expect(result).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("returns false and replies with the acceptance card when not accepted", async () => {
    const fakeClient = {
      getUserSettings: () =>
        Promise.resolve({
          success: true,
          settings: userSettings(0),
        } as unknown as GetUserSettingsResponse),
    };
    const { calls, interaction } = captureReply();
    const result = await assertAccepted(interaction, ENV, fakeClient as never);
    expect(result).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.flags).toBeDefined();
  });

  test("fails open and returns true on RPC error", async () => {
    const fakeClient = {
      getUserSettings: () => Promise.reject(new Error("engine down")),
    };
    const { calls, interaction } = captureReply();
    const result = await assertAccepted(interaction, ENV, fakeClient as never);
    expect(result).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("buildAcceptanceCard", () => {
  test("emits the Accept & Continue button with the expected customId", () => {
    const card = buildAcceptanceCard({} as never).toJSON();
    const components = card["components"] as { type: number; custom_id?: string }[];
    const button = components.find((c) => c.custom_id === ACCEPT_BUTTON);
    expect(button).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails to compile**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/_shared/acceptance.test.ts 2>&1 | tail -10
```

Expected: FAIL — `./acceptance.js` does not exist.

- [ ] **Step 3: Implement acceptance.ts**

Write `apps/worker/src/interactions/_shared/acceptance.ts`:

```ts
import {
  ContainerBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  formatApplicationEmoji,
  type ApplicationEmojiCatalog,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalInteraction,
  type JsonValue,
  type DiscordApiError,
  type DiscordRequestContext,
  type Result,
} from "@parley/runtime";
import {
  GetUserSettingsRequest,
  type GetUserSettingsResponse,
  type UserSettings as ProtoUserSettings,
} from "@parley/proto";
import { ConnectError } from "@connectrpc/connect";
import { err, ok } from "neverthrow";
import { resolveEngineTransport } from "../../engine-transport.js";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { UserSettingsService } from "@parley/proto";
import { UI_TOKENS } from "../../ui/tokens.js";

export const ACCEPT_BUTTON = "user/accept-terms";

const SETTINGS_CACHE_KEY = (discordUserId: string) => `user-settings-cache:${discordUserId}`;

const SETTINGS_CACHE_TTL_MS = 30_000;

type Ctx = {
  env: unknown;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
};

type GatedInteraction =
  | ChatInputCommandInteraction
  | MessageComponentInteraction
  | ModalInteraction;

type GatedReplyInteraction = {
  user?: { id?: string };
  reply: (
    options: { components: unknown[]; flags?: number },
    forceEphemeral?: boolean,
  ) => Promise<Result<JsonValue, DiscordApiError>>;
};

type GetUserSettingsClient = {
  getUserSettings: (req: GetUserSettingsRequest) => Promise<GetUserSettingsResponse>;
};

export function buildAcceptanceCard(emojis: ApplicationEmojiCatalog): ContainerBuilder {
  const formatted = formatApplicationEmoji(emojis, "pin");
  const title = formatted ? `${formatted} **Before you start**` : "**Before you start**";
  return new ContainerBuilder()
    .setAccentColor(UI_TOKENS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(title),
      new TextDisplayBuilder().setContent(
        "Parley links your Discord to your in-game profile and stores match, stats, and tournament data so we can run ranked queues and tournaments.",
      ),
      new TextDisplayBuilder().setContent(
        "By continuing you accept our [Privacy Policy](https://parley.bot/privacy) and [Terms of Service](https://parley.bot/terms).",
      ),
      {
        // Discord accessory button
        type: 1,
        components: [
          new ButtonBuilder().setCustomId(ACCEPT_BUTTON).setLabel("Accept & Continue").setStyle(2),
        ],
      } as never,
    );
}

async function fetchSettings(
  interaction: GatedInteraction,
  client: GetUserSettingsClient,
): Promise<ProtoUserSettings | undefined> {
  const ctx = interaction.context as Ctx;
  const discordUserId = interaction.user?.id ?? "";
  const cacheKey = SETTINGS_CACHE_KEY(discordUserId);
  const cached = ctx.get<{ at: number; value: ProtoUserSettings | undefined }>(cacheKey);
  if (cached && Date.now() - cached.at < SETTINGS_CACHE_TTL_MS) {
    return cached.value;
  }
  const response = await client.getUserSettings({ discordUserId }).catch(() => undefined);
  const settings = response?.success ? response.settings : undefined;
  ctx.set(cacheKey, { at: Date.now(), value: settings });
  return settings;
}

export async function assertAccepted(
  interaction: GatedInteraction,
  env: unknown,
  injectedClient?: GetUserSettingsClient,
): Promise<boolean> {
  const discordUserId = interaction.user?.id;
  if (!discordUserId) {
    return true;
  }

  const client: GetUserSettingsClient =
    injectedClient ??
    (() => {
      const config = resolveEngineTransport(env as never);
      const transport = createConnectTransport({
        baseUrl: config.baseUrl,
        fetch: config.fetchImpl as typeof fetch,
        jsonOptions: { enumAsInteger: true },
      });
      return createClient(UserSettingsService, transport) as unknown as GetUserSettingsClient;
    })();

  let settings: ProtoUserSettings | undefined;
  try {
    settings = await fetchSettings(interaction, client);
  } catch (cause: unknown) {
    // Fail open: don't brick the bot when the engine is degraded.
    console.warn("user_settings.fetch_failed", cause);
    return true;
  }

  if (settings && settings.termsAcceptedAtMs > 0) {
    return true;
  }

  const replyable = interaction as unknown as GatedReplyInteraction;
  await replyable.reply(
    {
      components: [buildAcceptanceCard({} as ApplicationEmojiCatalog).toJSON()],
      flags: 64 | 32768,
    },
    true,
  );
  return false;
}
```

Note: the acceptance card is sent as a container, not a Section+accessory, because `ButtonBuilder` standalone requires a `Section` wrapper. The card is dispatched as a raw container + the Components v2 flag. Simpler than threading Section through `buildAcceptanceCard`. Adjust if testing surfaces a Discord API error.

- [ ] **Step 4: Run the test, expect green**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/_shared/acceptance.test.ts 2>&1 | tail -20
```

Expected: 4 passed.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/juwen/dev/commerce/parley && bun run typecheck 2>&1 | tail -10
```

Expected: clean. (May surface errors in `profile.ts` if its import of `assertAccepted` doesn't match the new signature; fix in step 6.)

- [ ] **Step 6: Adjust the `assertAccepted` call in profile.ts**

The signature changed (now takes an optional injected client). Update `profile.ts` line ~28 from:

```ts
if (!(await assertAccepted(interaction, env))) {
```

to:

```ts
if (!(await assertAccepted(interaction, env as never))) {
```

- [ ] **Step 7: Re-run typecheck**

```bash
cd /Users/juwen/dev/commerce/parley && bun run typecheck 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/interactions/_shared/ apps/worker/src/interactions/profile.ts && git commit -m "feat(acceptance): assertAccepted gate + acceptance card"
```

---

## Task 11: Build the /user interaction module

**Files:**

- Create: `apps/worker/src/interactions/user/constants.ts`
- Create: `apps/worker/src/interactions/user/ui.ts`
- Create: `apps/worker/src/interactions/user/ui.test.ts`
- Create: `apps/worker/src/interactions/user/rpc.ts`
- Create: `apps/worker/src/interactions/user/rpc.test.ts`
- Create: `apps/worker/src/interactions/user/modal.ts`
- Create: `apps/worker/src/interactions/user/components.ts`
- Create: `apps/worker/src/interactions/user/components.test.ts`
- Create: `apps/worker/src/interactions/user/slash.ts`
- Create: `apps/worker/src/interactions/user/index.ts`

This is a large task broken into sub-tasks. Each sub-task has its own commit.

### 11a: constants.ts

- [ ] **Step 1: Create constants.ts**

Write `apps/worker/src/interactions/user/constants.ts`:

```ts
import { UI_TOKENS } from "../../ui/tokens.js";

export const USER_ACCEPT_BUTTON = "user/accept-terms";
export const USER_LANG_PREFIX = "user/lang/";
export const USER_MATCHMAKING_PREFIX = "user/matchmaking/";
export const USER_VISIBILITY_PREFIX = "user/visibility/";
export const USER_TIMEZONE_PREFIX = "user/timezone/";
export const USER_REFRESH_STATS = "user/refresh-stats";
export const USER_DELETE_OPEN = "user/delete/open";
export const USER_DELETE_MODAL = "user-delete-modal";
export const USER_CANCEL = "user/cancel";

export const LANGUAGES = [
  { value: "en", label: "English", emoji: "🇬🇧" },
  { value: "de", label: "Deutsch", emoji: "🇩🇪" },
] as const;

export const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "US/Pacific", label: "US · Pacific" },
  { value: "US/Mountain", label: "US · Mountain" },
  { value: "US/Central", label: "US · Central" },
  { value: "US/Eastern", label: "US · Eastern" },
  { value: "Europe/London", label: "Europe · London" },
  { value: "Europe/Berlin", label: "Europe · Berlin" },
  { value: "Europe/Madrid", label: "Europe · Madrid" },
  { value: "Europe/Athens", label: "Europe · Athens" },
  { value: "Asia/Dubai", label: "Asia · Dubai" },
  { value: "Asia/Tokyo", label: "Asia · Tokyo" },
  { value: "Australia/Sydney", label: "Australia · Sydney" },
] as const;

export const COLORS = UI_TOKENS;
```

- [ ] **Step 2: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/interactions/user/constants.ts && git commit -m "feat(user): constants and custom-id tokens"
```

### 11b: ui.ts + ui.test.ts

- [ ] **Step 3: Write the failing ui tests**

Write `apps/worker/src/interactions/user/ui.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ComponentType } from "discord-api-types/v10";
import {
  buildSettingsCard,
  buildErrorCard,
  buildDeleteResultCard,
  buildInfoCard,
  buildRefreshErrorCard,
} from "./ui.js";

const SETTINGS = {
  discordUserId: "u1",
  language: 1,
  matchmakingEnabled: true,
  termsAcceptedAtMs: Date.now(),
  profilePublic: true,
  timezone: "Europe/Berlin",
} as never;

describe("user/ui — settings card", () => {
  test("renders the four setting rows", () => {
    const card = buildSettingsCard(SETTINGS, {} as never).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("Language");
    expect(text).toContain("Matchmaking");
    expect(text).toContain("Visibility");
    expect(text).toContain("Timezone");
  });

  test("has no footer text", () => {
    const card = buildSettingsCard(SETTINGS, {} as never).toJSON();
    const text = JSON.stringify(card);
    expect(text).not.toContain("-# Parley");
    expect(text).not.toContain("— Parley");
  });

  test("uses the graphite main accent", () => {
    const card = buildSettingsCard(SETTINGS, {} as never).toJSON();
    expect(card["accent_color"]).toBe(0x8a8a8e);
  });
});

describe("user/ui — result cards", () => {
  test("error card uses the error color", () => {
    const card = buildErrorCard("oops", {} as never).toJSON();
    expect(card["accent_color"]).toBe(0xef4444);
    expect(JSON.stringify(card)).toContain("oops");
  });

  test("info card uses the main color", () => {
    const card = buildInfoCard("hello").toJSON();
    expect(card["accent_color"]).toBe(0x8a8a8e);
  });

  test("delete result card shows cooldown_until_ms as a Discord timestamp", () => {
    const card = buildDeleteResultCard(
      {
        anonymizedDiscordUserId: "anon",
        cooldownUntilMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
        tablesAffected: {
          players: 1,
          discordIdentities: 1,
        } as never,
      },
      {} as never,
    ).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("<t:");
    expect(text).toContain("anon");
  });

  test("refresh error card uses the warning color", () => {
    const card = buildRefreshErrorCard("timeout", {} as never).toJSON();
    expect(card["accent_color"]).toBe(0xf59e0b);
    expect(JSON.stringify(card)).toContain("timeout");
  });
});
```

- [ ] **Step 4: Run tests, expect compile failure (ui.ts doesn't exist)**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/user/ui.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 5: Implement ui.ts**

Write `apps/worker/src/interactions/user/ui.ts`:

```ts
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  formatApplicationEmoji,
  type ApplicationEmojiCatalog,
} from "@parley/runtime";
import { COLORS } from "./constants.js";
import type { UserSettings as ProtoUserSettings, AnonymizationCounts } from "@parley/proto";
import { Language } from "@parley/proto";

const SEPARATOR_SPACING_SMALL = 1;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function languageLabel(lang: number): string {
  return lang === Language.DE ? "Deutsch" : "English";
}

function languageValue(lang: number): string {
  return lang === Language.DE ? "de" : "en";
}

function visibilityLabel(public_: boolean): string {
  return public_ ? "Public" : "Hidden";
}

/** Prefix a title with an app-emoji formatted for Components v2, if present. */
function titleWith(catalog: ApplicationEmojiCatalog, emojiName: string, title: string): string {
  const formatted = formatApplicationEmoji(catalog, emojiName);
  return formatted ? `${formatted} **${title}**` : `**${title}**`;
}

export function buildSettingsCard(
  settings: ProtoUserSettings,
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
  const cooldownLine =
    settings.termsAcceptedAtMs > 0 ? "Cooldown: none" : "Cooldown: not yet accepted";

  return new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(emojis, "pin", "Your Settings")),
      new TextDisplayBuilder().setContent(
        "Language · Matchmaking · Visibility · Timezone · Cooldown",
      ),
      separator(),
      new TextDisplayBuilder().setContent(`**Language**\n${languageLabel(settings.language)}`),
      new TextDisplayBuilder().setContent(
        `**Matchmaking**\n${settings.matchmakingEnabled ? "● Enabled" : "○ Disabled"}`,
      ),
      new TextDisplayBuilder().setContent(
        `**Visibility**\n${visibilityLabel(settings.profilePublic)}`,
      ),
      new TextDisplayBuilder().setContent(`**Timezone**\n${settings.timezone}`),
      separator(),
      new TextDisplayBuilder().setContent(cooldownLine),
      separator(),
      new TextDisplayBuilder().setContent("Use the buttons below to change a setting."),
    );
}

export function buildInfoCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(new TextDisplayBuilder().setContent(message));
}

export function buildErrorCard(message: string, emojis: ApplicationEmojiCatalog): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.error)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(emojis, "ban_hammer_red", "Settings Error")),
      separator(),
      new TextDisplayBuilder().setContent(message),
    );
}

export function buildRefreshErrorCard(
  message: string,
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.warning)
    .addComponents(
      new TextDisplayBuilder().setContent(
        titleWith(emojis, "warning_orange", "Stats Refresh Failed"),
      ),
      separator(),
      new TextDisplayBuilder().setContent(message),
    );
}

export function buildDeleteResultCard(
  response: {
    anonymizedDiscordUserId: string;
    cooldownUntilMs: number;
    tablesAffected: AnonymizationCounts;
  },
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
  const t = response.tablesAffected;
  const lines = [
    `Players: ${t.players}`,
    `Discord identities: ${t.discordIdentities}`,
    `Guild memberships: ${t.guildMemberships}`,
    `Matches: ${t.matches}`,
    `Match participants: ${t.matchParticipants}`,
    `Queues: ${t.matchmakingQueues}`,
    `Queue participants: ${t.matchmakingQueueParticipants}`,
    `Tournaments: ${t.tournaments}`,
    `Tournament teams: ${t.tournamentTeams}`,
    `Tournament rosters: ${t.tournamentTeamRosters}`,
  ];

  const cooldownDiscordTs = `<t:${Math.floor(response.cooldownUntilMs / 1000)}:F>`;

  return new ContainerBuilder()
    .setAccentColor(COLORS.error)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(emojis, "trash_red", "Data Deleted")),
      separator(),
      new TextDisplayBuilder().setContent(
        "Your records are anonymized. You may re-link a new account after the cooldown ends.",
      ),
      new TextDisplayBuilder().setContent(
        `**Anonymized id**\n\`${response.anonymizedDiscordUserId}\``,
      ),
      new TextDisplayBuilder().setContent(`**Cooldown ends**\n${cooldownDiscordTs}`),
      new TextDisplayBuilder().setContent(`**Tables affected**\n${lines.join("\n")}`),
    );
}

// Re-export for tests and components module
export { languageLabel, languageValue, visibilityLabel };
```

The acceptance card in `_shared/acceptance.ts` (Task 10) also uses a unicode 🛡️ — update that to use `pin` via the same `titleWith` pattern. The fix is a one-line change in Task 10's `buildAcceptanceCard`.

- [ ] **Step 6: Run the test, expect green**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/user/ui.test.ts 2>&1 | tail -20
```

Expected: all passed.

- [ ] **Step 7: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/interactions/user/ui.ts apps/worker/src/interactions/user/ui.test.ts && git commit -m "feat(user): settings card and result card builders"
```

### 11c: rpc.ts + rpc.test.ts

- [ ] **Step 8: Write the failing rpc tests**

Write `apps/worker/src/interactions/user/rpc.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ConnectError } from "@connectrpc/connect";
import { Language } from "@parley/proto";
import type {
  DeleteUserDataResponse,
  GetUserSettingsResponse,
  UpsertUserSettingsResponse,
} from "@parley/proto";
import { invokeDeleteUserData, invokeGetUserSettings, invokeUpsertUserSettings } from "./rpc.js";

describe("invokeGetUserSettings", () => {
  test("wraps a successful response in Ok", async () => {
    const client = {
      getUserSettings: () =>
        Promise.resolve({
          success: true,
          settings: { discordUserId: "u1" },
        } as unknown as GetUserSettingsResponse),
    };
    const r = await invokeGetUserSettings(client, "u1");
    expect(r.isOk()).toBe(true);
  });

  test("wraps a thrown ConnectError unchanged", async () => {
    const err = new ConnectError("InvalidArgument", 3, {});
    const client = { getUserSettings: () => Promise.reject(err) };
    const r = await invokeGetUserSettings(client, "u1");
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe(err);
  });
});

describe("invokeUpsertUserSettings", () => {
  test("forwards every field through to the client", async () => {
    const calls: unknown[] = [];
    const client = {
      upsertUserSettings: (req: unknown) => {
        calls.push(req);
        return Promise.resolve({ success: true } as unknown as UpsertUserSettingsResponse);
      },
    };
    await invokeUpsertUserSettings(client, {
      discordUserId: "u1",
      language: Language.DE,
      matchmakingEnabled: false,
      termsAcceptedAtMs: 100,
      profilePublic: false,
      timezone: "Europe/Berlin",
    });
    expect(calls).toHaveLength(1);
  });
});

describe("invokeDeleteUserData", () => {
  test("surfaces cooldown_until_ms in the Ok branch", async () => {
    const client = {
      deleteUserData: () =>
        Promise.resolve({
          success: true,
          anonymizedDiscordUserId: "anon",
          cooldownUntilMs: 1234,
        } as unknown as DeleteUserDataResponse),
    };
    const r = await invokeDeleteUserData(client, "u1");
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.cooldownUntilMs).toBe(1234);
  });
});
```

- [ ] **Step 9: Run tests, expect fail (rpc.ts missing)**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/user/rpc.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 10: Implement rpc.ts**

Write `apps/worker/src/interactions/user/rpc.ts`:

```ts
import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "neverthrow";
import {
  DeleteUserDataRequest,
  GetUserSettingsRequest,
  UpsertUserSettingsRequest,
  type DeleteUserDataResponse,
  type GetUserSettingsResponse,
  type UpsertUserSettingsResponse,
} from "@parley/proto";
import type { UserSettings as ProtoUserSettings } from "@parley/proto";

type AnyClient = Record<string, (req: unknown) => Promise<unknown>>;

function wrap<TReq, TRes>(fn: (req: TReq) => Promise<TRes>): Promise<Result<TRes, ConnectError>> {
  return fn
    .bind(fn)()
    .then(
      (response: TRes) => ok(response),
      (cause: unknown) =>
        err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
    );
}

export function invokeGetUserSettings(
  client: { getUserSettings: (req: GetUserSettingsRequest) => Promise<GetUserSettingsResponse> },
  discordUserId: string,
): Promise<Result<GetUserSettingsResponse, ConnectError>> {
  return wrap(() => client.getUserSettings({ discordUserId }));
}

export function invokeUpsertUserSettings(
  client: {
    upsertUserSettings: (req: UpsertUserSettingsRequest) => Promise<UpsertUserSettingsResponse>;
  },
  settings: ProtoUserSettings,
): Promise<Result<UpsertUserSettingsResponse, ConnectError>> {
  return wrap(() => client.upsertUserSettings({ settings }));
}

export function invokeDeleteUserData(
  client: { deleteUserData: (req: DeleteUserDataRequest) => Promise<DeleteUserDataResponse> },
  discordUserId: string,
): Promise<Result<DeleteUserDataResponse, ConnectError>> {
  return wrap(() => client.deleteUserData({ discordUserId }));
}

// Silence unused warnings for the helper type
export type { AnyClient };
```

- [ ] **Step 11: Run tests, expect green**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/user/rpc.test.ts 2>&1 | tail -20
```

Expected: all passed.

- [ ] **Step 12: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/interactions/user/rpc.ts apps/worker/src/interactions/user/rpc.test.ts && git commit -m "feat(user): engine client wrappers for UserSettings"
```

### 11d: modal.ts

- [ ] **Step 13: Implement modal.ts**

Write `apps/worker/src/interactions/user/modal.ts`:

```ts
import { ModalBuilder, TextInputBuilder, TextDisplayBuilder } from "@parley/runtime";
import { TextInputStyle } from "discord-api-types/v10";
import { USER_DELETE_MODAL } from "./constants.js";

export function buildDeleteConfirmModal(expectedUsername: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(USER_DELETE_MODAL)
    .setTitle("Delete your data?")
    .addComponents(
      new TextDisplayBuilder().setContent(
        "This will anonymize all your linked accounts, match history, and tournament data. You will not be able to re-link for 30 days.",
      ),
      new TextInputBuilder()
        .setCustomId("user/delete-confirm-input")
        .setLabel(`Type "${expectedUsername}" to confirm`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(64),
    );
}
```

- [ ] **Step 14: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/interactions/user/modal.ts && git commit -m "feat(user): delete confirm modal"
```

### 11e: components.ts + components.test.ts

- [ ] **Step 15: Write the failing component tests**

Write `apps/worker/src/interactions/user/components.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ok, type Result } from "neverthrow";
import type { JsonValue, DiscordApiError } from "@parley/runtime";
import {
  USER_CANCEL,
  USER_DELETE_OPEN,
  USER_LANG_PREFIX,
  USER_MATCHMAKING_PREFIX,
  USER_VISIBILITY_PREFIX,
  USER_REFRESH_STATS,
  USER_TIMEZONE_PREFIX,
} from "./constants.js";

describe("user/constants — customId prefixes", () => {
  test("language prefix is user/lang/", () => {
    expect(USER_LANG_PREFIX).toBe("user/lang/");
  });
  test("matchmaking prefix is user/matchmaking/", () => {
    expect(USER_MATCHMAKING_PREFIX).toBe("user/matchmaking/");
  });
  test("visibility prefix is user/visibility/", () => {
    expect(USER_VISIBILITY_PREFIX).toBe("user/visibility/");
  });
  test("timezone prefix is user/timezone/", () => {
    expect(USER_TIMEZONE_PREFIX).toBe("user/timezone/");
  });
  test("refresh stats is the constant string", () => {
    expect(USER_REFRESH_STATS).toBe("user/refresh-stats");
  });
  test("delete open is the constant string", () => {
    expect(USER_DELETE_OPEN).toBe("user/delete/open");
  });
  test("cancel is the constant string", () => {
    expect(USER_CANCEL).toBe("user/cancel");
  });
});

// Smoke test: ensure the components module exports a handler
import { userButtonHandler } from "./components.js";
test("userButtonHandler is registered with the user prefix", () => {
  expect(userButtonHandler).toBeDefined();
});
```

- [ ] **Step 16: Run, expect FAIL**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/user/components.test.ts 2>&1 | tail -10
```

Expected: FAIL — `components.js` does not exist.

- [ ] **Step 17: Implement components.ts**

Write `apps/worker/src/interactions/user/components.ts`:

```ts
import {
  ComponentHandler,
  ModalHandler,
  parseCustomId,
  type MessageComponentInteraction,
  type ModalInteraction,
  logger,
} from "@parley/runtime";
import {
  USER_CANCEL,
  USER_DELETE_MODAL,
  USER_DELETE_OPEN,
  USER_LANG_PREFIX,
  USER_MATCHMAKING_PREFIX,
  USER_REFRESH_STATS,
  USER_TIMEZONE_PREFIX,
  USER_VISIBILITY_PREFIX,
} from "./constants.js";
import { replyV2, updateV2, editReplyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { resolveEngineTransport } from "../../engine-transport.js";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import {
  Language,
  UserSettingsService,
  type UserSettings as ProtoUserSettings,
} from "@parley/proto";
import { nowMs } from "./helpers.js";
import {
  buildDeleteConfirmModal,
  buildDeleteResultCard,
  buildErrorCard,
  buildInfoCard,
  buildRefreshErrorCard,
  buildSettingsCard,
} from "./ui.js";
import { invokeDeleteUserData, invokeGetUserSettings, invokeUpsertUserSettings } from "./rpc.js";
import { executeFetchStats } from "../_shared/stats.js";

const COMPONENT_BUTTON = 2;
const MODAL_SUBMIT = 5;

function getClient(env: unknown) {
  const config = resolveEngineTransport(env as never);
  const transport = createConnectTransport({
    baseUrl: config.baseUrl,
    fetch: config.fetchImpl as typeof fetch,
    jsonOptions: { enumAsInteger: true },
  });
  return createClient(UserSettingsService, transport);
}

function getOrFetchSettings(env: unknown, discordUserId: string) {
  const client = getClient(env) as never;
  return invokeGetUserSettings(client, discordUserId);
}

async function applyUpdate(
  interaction: MessageComponentInteraction,
  newSettings: ProtoUserSettings,
) {
  const env = interaction.context.env;
  const client = getClient(env) as never;
  const result = await invokeUpsertUserSettings(client, newSettings);
  if (result.isErr()) {
    await editReplyV2(interaction, buildErrorCard(result.error.message, {} as never));
    return;
  }
  if (!result.value.success) {
    await editReplyV2(
      interaction,
      buildErrorCard(result.value.error?.message ?? "Settings update failed", {} as never),
    );
    return;
  }
  const emojis = await resolveEmojis(interaction);
  const card = buildSettingsCard(result.value.settings ?? newSettings, emojis);
  await editReplyV2(interaction, card);
}

function baseSettings(discordUserId: string): ProtoUserSettings {
  return {
    discordUserId,
    language: Language.EN,
    updatedAtMs: 0,
    matchmakingEnabled: true,
    termsAcceptedAtMs: 0,
    profilePublic: true,
    timezone: "UTC",
  } as unknown as ProtoUserSettings;
}

export const userButtonHandler = new ComponentHandler("user", COMPONENT_BUTTON).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const customId = interaction.customId;
    const env = interaction.context.env;
    const discordUserId = interaction.user?.id ?? "";
    const settingsResult = await getOrFetchSettings(env, discordUserId);
    if (settingsResult.isErr() || !settingsResult.value.success || !settingsResult.value.settings) {
      await replyV2(
        interaction,
        buildErrorCard("Could not load your settings.", {} as never),
        true,
      );
      return;
    }
    const current = settingsResult.value.settings;

    if (customId.startsWith(USER_LANG_PREFIX)) {
      const v = customId.slice(USER_LANG_PREFIX.length);
      await applyUpdate(interaction, {
        ...current,
        language: v === "de" ? Language.DE : Language.EN,
        updatedAtMs: nowMs(),
      });
      return;
    }
    if (customId.startsWith(USER_MATCHMAKING_PREFIX)) {
      const v = customId.slice(USER_MATCHMAKING_PREFIX.length);
      await applyUpdate(interaction, {
        ...current,
        matchmakingEnabled: v === "on",
        updatedAtMs: nowMs(),
      });
      return;
    }
    if (customId.startsWith(USER_VISIBILITY_PREFIX)) {
      const v = customId.slice(USER_VISIBILITY_PREFIX.length);
      await applyUpdate(interaction, {
        ...current,
        profilePublic: v === "public",
        updatedAtMs: nowMs(),
      });
      return;
    }
    if (customId.startsWith(USER_TIMEZONE_PREFIX)) {
      const tz = decodeURIComponent(customId.slice(USER_TIMEZONE_PREFIX.length));
      await applyUpdate(interaction, { ...current, timezone: tz, updatedAtMs: nowMs() });
      return;
    }
    if (customId === USER_REFRESH_STATS) {
      // Find the user's linked identity. For now, send a hint to /profile —
      // the full refresh requires looking up the linked player + platform
      // via IdentityService.LookupByDiscord, which the spec defers.
      await editReplyV2(
        interaction,
        buildInfoCard(
          "To refresh your stats, run `/profile` first to confirm your linked account, then click here again. Full auto-refresh ships next cycle.",
        ),
      );
      return;
    }
    if (customId === USER_DELETE_OPEN) {
      const deferred = await interaction.deferUpdate();
      if (deferred.isErr()) return;
      const modal = buildDeleteConfirmModal(interaction.user?.username ?? "");
      const r = await interaction.showModal(modal);
      if (r.isErr()) {
        logger.error("user.modal_open_failed", "Failed to open delete modal", {
          interactionId: interaction.id,
          error: r.error,
        });
      }
      return;
    }
    if (customId === USER_CANCEL) {
      await editReplyV2(interaction, buildSettingsCard(current, {} as never));
      return;
    }
  },
);

export const userModalHandler = new ModalHandler(USER_DELETE_MODAL, MODAL_SUBMIT).addHandler(
  async (interaction: ModalInteraction) => {
    const env = interaction.context.env;
    const discordUserId = interaction.user?.id ?? "";
    const deferred = await interaction.deferUpdate();
    if (deferred.isErr()) return;
    const client = getClient(env) as never;
    const result = await invokeDeleteUserData(client, discordUserId);
    if (result.isErr()) {
      await editReplyV2(interaction, buildErrorCard(result.error.message, {} as never));
      return;
    }
    if (!result.value.success || !result.value.anonymizedDiscordUserId) {
      await editReplyV2(
        interaction,
        buildErrorCard(result.value.error?.message ?? "Could not delete your data.", {} as never),
      );
      return;
    }
    const card = buildDeleteResultCard(
      {
        anonymizedDiscordUserId: result.value.anonymizedDiscordUserId,
        cooldownUntilMs: result.value.cooldownUntilMs,
        tablesAffected: result.value.tablesAffected!,
      },
      {} as never,
    );
    await editReplyV2(interaction, card);
  },
);

export const acceptButtonHandler = new ComponentHandler("user", COMPONENT_BUTTON).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const env = interaction.context.env;
    const discordUserId = interaction.user?.id ?? "";
    const settingsResult = await getOrFetchSettings(env, discordUserId);
    const current =
      settingsResult.isOk() && settingsResult.value.success
        ? (settingsResult.value.settings ?? baseSettings(discordUserId))
        : baseSettings(discordUserId);
    const client = getClient(env) as never;
    const updated: ProtoUserSettings = {
      ...current,
      termsAcceptedAtMs: nowMs(),
      updatedAtMs: nowMs(),
    };
    const r = await invokeUpsertUserSettings(client, updated);
    if (r.isErr()) {
      await updateV2(interaction, buildErrorCard(r.error.message, {} as never));
      return;
    }
    await updateV2(interaction, buildInfoCard("✅ Accepted. Please re-run your command."));
  },
);
```

- [ ] **Step 18: Create helpers.ts with nowMs**

Write `apps/worker/src/interactions/user/helpers.ts`:

```ts
export function nowMs(): number {
  return Date.now();
}
```

- [ ] **Step 19: Run, expect green**

```bash
cd /Users/juwen/dev/commerce/parley && bun test apps/worker/src/interactions/user/components.test.ts 2>&1 | tail -20
```

Expected: all passed.

- [ ] **Step 20: Typecheck**

```bash
cd /Users/juwen/dev/commerce/parley && bun run typecheck 2>&1 | tail -20
```

Expected: clean. (May surface a few type nits — fix inline: the runtime's `ComponentHandler.addHandler` signature may need a specific generic for `MessageComponentInteraction`. Adjust if compile errors.)

- [ ] **Step 21: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/interactions/user/components.ts apps/worker/src/interactions/user/components.test.ts apps/worker/src/interactions/user/helpers.ts && git commit -m "feat(user): button + modal handlers, accept-button handler"
```

### 11f: slash.ts + index.ts

- [ ] **Step 22: Implement slash.ts**

Write `apps/worker/src/interactions/user/slash.ts`:

```ts
import { SlashCommand, type ChatInputCommandInteraction, logger } from "@parley/runtime";
import { assertAccepted } from "./_shared/acceptance.js" assert { type: "js" };
// Resolve the runtime helper from its real path
import { assertAccepted as _assertAccepted } from "../_shared/acceptance.js";
import { resolveEngineTransport } from "../../engine-transport.js";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { UserSettingsService } from "@parley/proto";
import { resolveEmojis } from "../../ui/emojis.js";
import { replyV2 } from "../../ui/discord.js";
import { invokeGetUserSettings } from "./rpc.js";
import { buildErrorCard, buildSettingsCard } from "./ui.js";
import type { EngineTransportEnv } from "../../transport.js";

export const userSlashCommand = new SlashCommand()
  .setName("user")
  .setDescription("Manage your language, matchmaking, visibility, timezone, and data")
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await _assertAccepted(interaction, env))) {
      return;
    }
    await interaction.deferReply(true);
    const config = resolveEngineTransport(env);
    const transport = createConnectTransport({
      baseUrl: config.baseUrl,
      fetch: config.fetchImpl as typeof fetch,
      jsonOptions: { enumAsInteger: true },
    });
    const client = createClient(UserSettingsService, transport);
    const discordUserId = interaction.user?.id ?? "";
    const r = await invokeGetUserSettings(client as never, discordUserId);
    if (r.isErr() || !r.value.success || !r.value.settings) {
      const message = r.isErr()
        ? r.error.message
        : (r.value.error?.message ?? "Could not load settings.");
      await interaction.editReply({ embeds: [{ description: message, color: 0xef4444 }] });
      return;
    }
    const emojis = await resolveEmojis(interaction);
    const card = buildSettingsCard(r.value.settings, emojis);
    await replyV2({ reply: interaction.editReply.bind(interaction) } as never, card, true);
  });
```

(Note: the `assert { type: "js" }` line at the top is intentional and the duplicate import is a workaround for the assertion. Delete the wrong-shaped first import after this; keep `_assertAccepted`.)

- [ ] **Step 23: Implement index.ts**

Write `apps/worker/src/interactions/user/index.ts`:

```ts
export { userSlashCommand } from "./slash.js";
export { userButtonHandler, userModalHandler, acceptButtonHandler } from "./components.js";
```

- [ ] **Step 24: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/interactions/user/slash.ts apps/worker/src/interactions/user/index.ts && git commit -m "feat(user): /user slash command"
```

---

## Task 12: Wire up app.ts + register-commands.ts + final verification

**Files:**

- Edit: `apps/worker/src/app.ts:1-18`
- Edit: `apps/worker/src/register-commands.ts:62-69`

- [ ] **Step 1: Register the new handlers in app.ts**

Replace the entire contents of `apps/worker/src/app.ts` with:

```ts
import { ParleyClient } from "@parley/runtime";
import { helpCommand } from "./interactions/help.js";
import {
  linkButtonHandler,
  linkSlashCommand,
  usernameModalHandler,
} from "./interactions/link/index.js";
import { pingCommand } from "./interactions/ping.js";
import { profileCommand } from "./interactions/profile.js";
import {
  acceptButtonHandler,
  userButtonHandler,
  userModalHandler,
  userSlashCommand,
} from "./interactions/user/index.js";

export function createApp(): ParleyClient {
  const client = new ParleyClient();
  client.loadHandlers(
    acceptButtonHandler,
    helpCommand,
    linkButtonHandler,
    linkSlashCommand,
    pingCommand,
    profileCommand,
    userButtonHandler,
    userModalHandler,
    userSlashCommand,
    usernameModalHandler,
  );
  return client;
}
```

- [ ] **Step 2: Add user command to register-commands.ts**

In `apps/worker/src/register-commands.ts`, replace the import block at lines 7-10 with:

```ts
import { helpCommand } from "./interactions/help.js";
import { linkSlashCommand } from "./interactions/link/slash.js";
import { pingCommand } from "./interactions/ping.js";
import { profileCommand } from "./interactions/profile.js";
import { userSlashCommand } from "./interactions/user/index.js";
```

Then replace the `const commands` line (line 62) with:

```ts
const commands = [pingCommand, helpCommand, linkSlashCommand, profileCommand, userSlashCommand];
```

- [ ] **Step 3: Add assertAccepted calls to link/slash and link/components**

In `apps/worker/src/interactions/link/slash.ts`, replace the addHandler body with:

```ts
import { SlashCommand, logger } from "@parley/runtime";
import { assertAccepted } from "../_shared/acceptance.js";
import { replyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { buildPlatformSelectCard } from "./ui.js";
import type { EngineTransportEnv } from "../../transport.js";

export const linkSlashCommand = new SlashCommand()
  .setName("link")
  .setDescription("Link your Discord to your in-game account")
  .addHandler(async (interaction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env))) {
      return;
    }
    const emojis = await resolveEmojis(interaction);
    const result = await replyV2(interaction, buildPlatformSelectCard(emojis), true);
    if (result.isErr()) {
      logger.error("link.platform_select_failed", "Failed to send platform select", {
        error: result.error,
        interactionId: interaction.id,
      });
    }
  });
```

In `apps/worker/src/interactions/link/components.ts`, add the same `assertAccepted` check at the top of the handler body. Find the line `async (interaction: MessageComponentInteraction) => {` and insert immediately after the opening brace:

```ts
const env = interaction.context.env as EngineTransportEnv;
if (!(await assertAccepted(interaction, env))) {
  return;
}
```

Add the import at the top:

```ts
import { assertAccepted } from "../_shared/acceptance.js";
import type { EngineTransportEnv } from "../../transport.js";
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/juwen/dev/commerce/parley && bun run typecheck 2>&1 | tail -30
```

Expected: clean. Fix any remaining nits inline.

- [ ] **Step 5: Run all tests**

```bash
cd /Users/juwen/dev/commerce/parley && cargo test 2>&1 | tail -10 && echo "---" && bun run test 2>&1 | tail -30
```

Expected: all green.

- [ ] **Step 6: Run linters + formatters**

```bash
cd /Users/juwen/dev/commerce/parley && cargo fmt && cargo clippy -- -D warnings 2>&1 | tail -10 && echo "---" && bun run format && bun run lint 2>&1 | tail -10
```

Expected: clean. Fix any nits inline.

- [ ] **Step 7: Commit**

```bash
cd /Users/juwen/dev/commerce/parley && git add apps/worker/src/app.ts apps/worker/src/register-commands.ts apps/worker/src/interactions/link/ && git commit -m "feat(worker): register /user, gate link behind acceptance"
```

---

## Task 13: Smoke test the end-to-end flow

This is the final V3 verification gate. The plan does not produce working software until this passes.

- [ ] **Step 1: Start the engine and worker locally**

Terminal A:

```bash
cd /Users/juwen/dev/commerce/parley && RUN_MIGRATIONS=1 cargo run 2>&1 | tail -10
```

Terminal B:

```bash
cd /Users/juwen/dev/commerce/parley/apps/worker && bun run dev 2>&1 | tail -10
```

Expected: engine listens on `:50051`, worker listens on Wrangler's local port (printed to stdout).

- [ ] **Step 2: Manually exercise the flow in a test Discord server**

1. With a fresh Discord user (no row in `user_settings`), run `/link` → assert: ephemeral acceptance card, no platform picker.
2. Click `Accept & Continue` → assert: card updates to "Accepted. Please re-run your command."
3. Run `/link` again → assert: platform picker appears. The first-run gate is now open.
4. Run `/user` → assert: settings card renders with English, Enabled, Public, UTC, no cooldown.
5. Click `[De]` on the language row → assert: card updates, language shows "Deutsch".
6. Run `/user` again → assert: card shows Deutsch.
7. Click `🗑️ Delete my data…` → assert: modal opens.
8. Type your Discord username and submit → assert: result card with anonymized id + cooldown timestamp + tables list.
9. Run `/user` again → assert: shows the new defaults (English) since your account was deleted; the cooldown hash isn't visible to the worker (intentional).

- [ ] **Step 3: Document the smoke test in the commit**

```bash
cd /Users/juwen/dev/commerce/parley && git commit --allow-empty -m "chore: /user settings + acceptance gate smoke-tested end-to-end"
```

- [ ] **Step 4: Push branch + open PR (only if user asks)**

The user controls commits and pushes per `~/.claude/CLAUDE.md`. Do not push without explicit instruction.

---

## Self-Review Notes (for the implementer)

**Spec coverage:**

- Proto + migration + Diesel mirror + models + repos + handler tests = Tasks 1-6 ✓
- Color tokens + footer removal + help/ping rewrite + profile edit = Tasks 7-8 ✓
- Shared stats helper = Task 9 ✓
- Acceptance gate = Task 10 ✓
- /user module (slash, components, modal, rpc, ui, constants, tests) = Task 11 ✓
- App registration + register-commands + link gate = Task 12 ✓
- End-to-end smoke = Task 13 ✓

**Known compromises:**

- Refresh-stats button currently shows a hint rather than auto-fetching the user's linked identity. Full auto-refresh needs `IdentityService.LookupByDiscord` first to find the linked player + platform, then a stats fetch. Out of scope for cycle A; addressed in a follow-up.
- The error paths in `profile.ts` still use the legacy `embeds` shape after `editReply` because the runtime's `editReply` doesn't yet support Components v2 containers. A runtime fix is a follow-up.
- The acceptance card uses a raw container+flag dispatch rather than a Section+accessory because `ButtonBuilder` standalone needs a Section wrapper. The simpler path is documented in Task 10; if Discord rejects, fall back to building via `replyV2` and check the runtime's `ButtonBuilder` API for standalone support.

**Risks to monitor during execution:**

- Proto field renumbering would break wire compatibility. The plan only adds new field numbers (5/6/7), which is backward-compatible per protobuf semantics.
- The `assertAccepted` fail-open behavior could mask a real engine outage from operators. Counter: every fail-open path logs at WARN.
- The acceptance card is dispatched in a way that may not match the runtime's `replyV2` expectations. If tests show a runtime-side error, refactor to use `replyV2` directly.
