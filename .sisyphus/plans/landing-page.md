# Parley Landing Page — Work Plan

## TL;DR

> **Quick Summary**: Build a marketing + command reference landing page for the Parley Discord bot at `apps/web`, matching the HQ app's dark command-center aesthetic, using TanStack Start + React 19 + Tailwind v4 + Cloudflare Workers. Include an interactive Discord message mock showing team balancing with fake ELO, a bot invite button, and a full command reference organized by the bot's 5 help categories.
>
> **Deliverables**:
>
> - New `apps/web` workspace package (`@parley/web`) integrated into the monorepo
> - Landing page with 5 sections: Hero, Features, Discord Mock, Command Reference, CTA/Footer
> - Monorepo integration (turbo.json, root package.json scripts)
> - CF Workers deployment config (wrangler.jsonc)
> - Favicon/icon suite in `public/`
>
> **Estimated Effort**: Medium (7-8 tasks)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (scaffold) → Task 3 (styles/design tokens) → Task 5 (page sections) → Task 7 (integration)

---

## Context

### Original Request

Build a landing page for the Parley bot in the style of the HQ app (apps/hq). Use TanStack Start and Cloudflare Workers. Showcase all features and add interactive functions — a Discord message mock with teams and fake ELO, plus a bot invite button. Folder: `apps/web`.

### Interview Summary

**Key Discussions**:

- Style: Match HQ app exactly (dark command-center, Space Grotesk, OKLCH tokens, grid overlay, sharp corners)
- Interactive: Discord message mock visual showing teams/fake ELO (not a functional demo)
- Purpose: Marketing + command reference documentation page
- Icons: User provided multi-platform favicon suite (PNG sizes for android/apple/ms/favicon)
- Bot name: Parley, banner at `https://cdn.parley.bot/parley-banner.png`

**Research Findings**:

- HQ uses TanStack Start + Vite 8 + React 19 + Tailwind v4 + CF Workers — identical stack to what we need
- Design system is CSS-variable-based (OKLCH colors, `@theme inline` for Tailwind v4, no tailwind.config)
- All UI components live in `apps/hq/src/components/ui/` — no shared package
- The bot has **9 slash commands / ~19 subcommands** (not 14/31 as initially thought)
- Help system organizes commands into 5 pages: Account, Teaming, Tournaments I, Tournaments II/Admin, Utility/Admin
- Grid overlay: 36pxCSS grid on `body::before`, 4% white lines, radial mask fade
- Ambient glow: Two radial gradients (top-left 6%, top-right 3%)
- Card glass effect: gradient overlay + inset top highlight

### Metis Review

**Identified Gaps** (addressed):

- Command count corrected: 9 commands / ~19 subcommands (from actual codebase, not initial claim of 14/31)
- Discord invite URL: Need the OAuth2 URL with application ID + permissions — will use placeholder initially
- Domain/hostname: Will use `parley-web` as worker name, can configure routes later
- `@tailwindcss/typography` plugin: Included — needed for command reference formatting
- Font `display=swap`: Added to Google Fonts import (HQ doesn't have this — fixing it)
- No API routes, no database, no auth — confirmed static/SSR landing page only
- No animation libraries — CSS hover/focus transitions only

---

## Work Objectives

### Core Objective

Create a fast, dark-themed landing page for Parley at `apps/web` that showcases bot features, provides a command reference, and includes a visual Discord message mock — all matching the HQ design system precisely.

### Concrete Deliverables

- `apps/web/` — full TanStack Start project, deployable to CF Workers
- `apps/web/src/styles.css` — design tokens matching HQ
- `apps/web/src/components/ui/button.tsx` — adapted from HQ
- `apps/web/src/components/ui/badge.tsx` — adapted from HQ
- `apps/web/src/components/ui/card.tsx` — adapted from HQ
- `apps/web/src/lib/utils.ts` — cn() utility from HQ
- `apps/web/src/routes/__root.tsx` — root layout with fonts, meta, favicon links
- `apps/web/src/routes/index.tsx` — landing page with all sections
- `apps/web/src/data/commands.ts` — static command reference data
- `apps/web/public/` — favicon/icon assets
- `apps/web/wrangler.jsonc` — CF Workers deployment config
- Monorepo integration: turbo.json pipeline, root package.json scripts

### Definition of Done

- [ ] `bun run typecheck --filter=@parley/web` passes with zero errors
- [ ] `oxlint apps/web` passes with zero errors
- [ ] `oxfmt --check apps/web` passes
- [ ] `bun run build --filter=@parley/web` succeeds
- [ ] No `@parley/db`, `@parley/auth`, or `@parley/core` imports in `apps/web/src/`
- [ ] `wrangler.jsonc` has no Hyperdrive/KV/Queue bindings

### Must Have

- All OKLCH color tokens matching HQ exactly
- Space Grotesk + IBM Plex Mono fonts
- Grid overlay (36px, 4% white, radial fade)
- Ambient glow (two radial gradients)
- Zero border-radius on card elements (matching HQ)
- Card glass effect (gradient overlay + inset highlight)
- Bot invite CTA button linking to Discord OAuth2
- All 9 commands documented with ~19 subcommands
- Discord message mock showing team balancing with fake ELO data
- Responsive breakpoints (320px, 768px, 1024px, 1440px)
- Favicon/icon suite in `public/`

### Must NOT Have (Guardrails)

- NO shared UI package extraction — copy components, don't create `packages/ui`
- NO database or auth imports (`@parley/db`, `@parley/auth`, `@parley/core`)
- NO Hyperdrive/KV/Queue bindings in `wrangler.jsonc`
- NO API routes or server-side data fetching
- NO animation libraries (framer-motion, gsap, etc.)
- NO scroll-triggered animations or intersection observer reveals
- NO custom illustrations or hero image assets (use existing icon/banner assets only)
- NO light mode toggle (dark mode only, matching HQ)
- NO blog, changelog, or analytics integration
- NO `.hq-*` CSS class prefix — use Tailwind utility classes directly or a new prefix
- NO dynamic content pipeline (CMS, MDX, markdown file system)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: NO (new app)
- **Automated tests**: NO unit tests — this is a static marketing page
- **Framework**: None (landing page, not business logic)
- **QA Method**: Agent-executed Playwright scenarios for visual/rendering verification + command-line build checks

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Landing page**: Use Playwright — navigate, verify sections render, check responsive breakpoints, screenshot
- **Build/deploy**: Use Bash (bun/curl) — build, typecheck, lint, check output artifacts
- **Data completeness**: Use Bash (grep) — verify all 9 commands appear in command data file

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + scaffolding):
├── Task 1: Project scaffolding + monorepo integration [quick]
├── Task 2: Design tokens + global styles [quick]
└── Task 3: Static assets (favicon/icon suite) [quick]

Wave 2 (After Wave 1 — components + data):
├── Task 4: UI components (Button, Badge, Card, cn) [quick]
├── Task 5: Command reference data file [quick]
├── Task 6: Discord message mock component [visual-engineering]
└── Task 7: Root layout + hero section [visual-engineering]

Wave 3 (After Wave 2 — page assembly + polish):
├── Task 8: Landing page assembly (all sections) [visual-engineering]
└── Task 9: Build verification + responsive QA [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1. Plan compliance audit (oracle)
├── F2. Code quality review (unspecified-high)
├── F3. Real manual QA — Playwright (unspecified-high + playwright)
└── F4. Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks     |
| ---- | ---------- | ---------- |
| 1    | —          | 4, 5, 6, 7 |
| 2    | 1          | 4, 7, 8    |
| 3    | 1          | 7          |
| 4    | 1, 2       | 8          |
| 5    | 1          | 8          |
| 6    | 1, 2       | 8          |
| 7    | 1, 2, 3    | 8          |
| 8    | 4, 5, 6, 7 | 9          |
| 9    | 8          | F1-F4      |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 4 tasks — T4 `quick`, T5 `quick`, T6 `visual-engineering`, T7 `visual-engineering`
- **Wave 3**: 2 tasks — T8 `visual-engineering`, T9 `deep`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high` (+ playwright), F4 `deep`

---

## TODOs

- [x] 1. Project scaffolding + monorepo integration

  **What to do**:
  - Create `apps/web/` directory with TanStack Start project structure mirroring HQ
  - Initialize `package.json` as `@parley/web` with dependencies matching HQ versions exactly: `@tanstack/react-start@latest`, `@cloudflare/vite-plugin@^1.26.0`, `@tailwindcss/vite@^4.1.18`, `tailwindcss@^4.1.18`, `tw-animate-css@^1.3.6`, `@tailwindcss/typography@^0.5.16`, `react@^19.2.0`, `react-dom@^19.2.0`, `vite@^8.0.0`, `wrangler@^4.70.0`, `class-variance-authority@^0.7.1`, `clsx@^2.1.1`, `tailwind-merge@^3.0.2`, `lucide-react@^1.14.0`
  - Dev deps: `@vitejs/plugin-react@^6.0.1`, `typescript@^6.0.2`, `@types/react@^19.2.0`, `@types/react-dom@^19.2.0`, `@tanstack/router-plugin@^1.132.0`, `@tanstack/devtools-vite@latest`, `@tanstack/react-devtools@latest`
  - Create `vite.config.ts` mirroring HQ's (cloudflare plugin, tailwindcss plugin, tanstackStart, react) — NO Hyperdrive env var in dev script
  - Create `tsconfig.json` extending `../tsconfig.base.json` (same pattern as HQ)
  - Create `wrangler.jsonc` with `name: "parley-web"`, `compatibility_date: "2026-05-01"`, `compatibility_flags: ["nodejs_compat"]`, `main: "@tanstack/react-start/server-entry"` — NO Hyperdrive/KV/Queue bindings
  - Create `src/routes/__root.tsx` with minimal root layout (html dark class, font links, meta tags)
  - Create `src/routes/index.tsx` placeholder with "Parley" heading
  - Create `src/app.tsx` and `src/router.tsx` (TanStack Start boilerplate)
  - Add `"imports": { "#/*": "./src/*" }` path alias to package.json
  - Add `build:web` pipeline to root `turbo.json` (pattern: `dependsOn: ["^build"]`, `outputs: ["dist/**"]`)
  - Add scripts to root `package.json`: `dev:web`, `build:web`, `deploy:web`, `cf-typegen:web`
  - Add `apps/web` to workspace (already covered by `"apps/*"` glob)
  - Run `bun install` to link workspace deps

  **Must NOT do**:
  - Do NOT import `@parley/db`, `@parley/auth`, or `@parley/core`
  - Do NOT add Hyperdrive, KV, or Queue bindings
  - Do NOT add `better-auth` dependency
  - Do NOT create a `packages/ui` shared package
  - Do NOT copy auth, database, or dashboard code from HQ

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-defined scaffolding — copy patterns from existing HQ app, no complex logic
  - **Skills**: []
    - No specialized skills needed for project scaffolding

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T2 and T3 conceptually, but T2/T3 need files from T1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `apps/hq/package.json` — Dependency versions, scripts pattern (dev, build, deploy, typecheck, cf-typegen), workspace deps format (`workspace:*`), `imports` path alias
  - `apps/hq/vite.config.ts` — Vite plugin order (cloudflare, devtools, tailwindcss, tanstackStart, react), `resolve.tsconfigPaths`
  - `apps/hq/tsconfig.json` — TypeScript config extending base, compiler options, path aliases
  - `apps/hq/wrangler.jsonc` — Wrangler config structure, compatibility settings (REMOVE Hyperdrive/KV/Queue bindings)
  - `apps/hq/src/routes/__root.tsx` — Root layout pattern (html dark class, meta, font loading)
  - `apps/hq/src/app.tsx` — TanStack Start app entry point
  - `apps/hq/src/router.tsx` — Router configuration
  - `turbo.json` — Pipeline structure, add `build:web` pipeline following `build:hq` pattern
  - Root `package.json` — Script naming pattern (`dev:hq`, `build:hq`, `deploy:hq`, `cf-typegen:hq`)

  **API/Type References**:
  - TanStack Start docs: `https://tanstack.com/start/latest/docs` — Project structure, file-based routing
  - Cloudflare Workers + TanStack Start: `https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/` — Deployment config

  **WHY Each Reference Matters**:
  - `apps/hq/package.json`: Exact dependency versions to match — version mismatch causes subtle bugs in monorepo
  - `apps/hq/vite.config.ts`: Plugin order matters — cloudflare plugin must have `viteEnvironment: { name: 'ssr' }` for SSR to work
  - `apps/hq/wrangler.jsonc`: Shows binding structure — we need the SAME config minus the application bindings
  - `apps/hq/src/routes/__root.tsx`: Root layout pattern to follow for dark class, fonts, meta tags
  - `turbo.json`: Must add `build:web` pipeline for monorepo build orchestration

  **Acceptance Criteria**:
  - [ ] `apps/web/` exists with `package.json`, `vite.config.ts`, `tsconfig.json`, `wrangler.jsonc`
  - [ ] `bun install` succeeds (workspace links resolve)
  - [ ] `bun run typecheck --filter=@parley/web` passes with zero errors
  - [ ] `apps/web/wrangler.jsonc` has `name: "parley-web"` and NO Hyperdrive/KV/Queue bindings
  - [ ] Root `turbo.json` has `build:web` pipeline
  - [ ] Root `package.json` has `dev:web`, `build:web`, `deploy:web` scripts

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Project scaffolding integrity check
    Tool: Bash
    Preconditions: apps/web directory created with all config files
    Steps:
      1. Run `ls apps/web/package.json apps/web/vite.config.ts apps/web/tsconfig.json apps/web/wrangler.jsonc apps/web/src/routes/__root.tsx`
      2. Assert all 5 files exist (exit code 0)
      3. Run `grep '"name": "@parley/web"' apps/web/package.json`
      4. Assert match found
      5. Run `grep -c "hyperdrive\|kv_namespaces\|queues" apps/web/wrangler.jsonc`
      6. Assert count is 0
      7. Run `grep "build:web" turbo.json`
      8. Assert match found
    Expected Result: All 5 config files exist, package is @parley/web, no server bindings, turbo pipeline present
    Failure Indicators: Missing files, wrong package name, bindings present in wrangler, missing turbo pipeline
    Evidence: .sisyphus/evidence/task-1-scaffold-integrity.txt

  Scenario: Dependency installation succeeds
    Tool: Bash
    Preconditions: package.json created with all dependencies
    Steps:
      1. Run `bun install` from workspace root
      2. Assert exit code 0
      3. Run `bun run typecheck --filter=@parley/web`
      4. Assert exit code 0
    Expected Result: Install and typecheck both succeed with zero errors
    Failure Indicators: Exit code non-zero, missing workspace resolution errors
    Evidence: .sisyphus/evidence/task-1-install-typecheck.txt
  ```

  **Commit**: YES (groups with this task only)
  - Message: `feat(web): scaffold @parley/web package`
  - Files: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/wrangler.jsonc`, `apps/web/tsconfig.json`, `apps/web/src/routes/__root.tsx`, `apps/web/src/app.tsx`, `apps/web/src/router.tsx`, `turbo.json`, root `package.json`
  - Pre-commit: `bun run typecheck --filter=@parley/web`

- [x] 2. Design tokens + global styles

  **What to do**:
  - Copy `apps/hq/src/styles.css` to `apps/web/src/styles.css` and adapt:
    - Remove HQ-specific classes (`.hq-shell`, `.hq-header`, `.hq-title`, `.hq-filters`, `.hq-kpi-grid`, `.kpi-grid`, `.chart-grid`, `.table-grid`, `.hq-chart`, `.hq-select`, `.hq-button`, `.auth-panel`, `.auth-title`, `.auth-copy`, `.recharts-*` overrides)
    - Keep ALL `:root` CSS variables (OKLCH colors, radius, borders)
    - Keep `@theme inline` block completely (font-sans, font-mono, color mappings)
    - Keep `@custom-variant dark` line
    - Keep `html, body, #app { min-height: 100% }`
    - Keep `body` background (radial gradients + linear gradient)
    - Keep `body::before` grid overlay (36px grid, 4% white, radial mask)
    - Keep `* { box-sizing: border-box }` and `a { color: inherit }` and `code { font-family: var(--font-mono) }`
    - Keep ALL 3 responsive breakpoints (1180, 840, 560) — adapt only the dashboard-specific selectors
    - FIX: Add `display=swap` to Google Fonts URL: change to `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap`
    - ADD landing-page-specific classes: `.lp-hero`, `.lp-section`, `.lp-container`, `.lp-grid` for landing page layout
    - DO NOT use `.hq-*` prefix — use `.lp-*` for any custom classes or Tailwind utility classes directly
  - Ensure `@import "tailwindcss"` and `@plugin "@tailwindcss/typography"` are present
  - Ensure `@import "tw-animate-css"` is present
  - Import `styles.css` in `__root.tsx`

  **Must NOT do**:
  - Do NOT create a `packages/ui` or shared styles package
  - Do NOT keep HQ dashboard-specific CSS (kpi-grid, chart-grid, auth-panel, etc.)
  - Do NOT use `.hq-*` class prefix on landing page elements
  - Do NOT modify the OKLCH color values — they must match HQ exactly

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adaptation of existing CSS file — selective copy and remove, no complex design work
  - **Skills**: []
    - CSS adaptation doesn't need specialized skills

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1 scaffold)
  - **Parallel Group**: Wave 1 (T1 must complete first)
  - **Blocks**: Tasks 4, 7, 8
  - **Blocked By**: Task 1

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `apps/hq/src/styles.css` — FULL FILE, all lines 1-416. Copy and adapt. Keep: `:root` vars (lines 8-42), `@theme inline` (lines 44-83), body styles (lines 85-98), `body::before` grid (lines 100-111), reset styles (lines 113-119). Remove: `.hq-shell` through `.hq-footer` (lines 125-281), `.auth-panel` through `.auth-copy` (lines 283-305), `.hq-chip` (lines 307-312), `.recharts-*` (lines 314-322). Keep responsive breakpoints but remove dashboard-specific selectors.

  **WHY Each Reference Matters**:
  - `apps/hq/src/styles.css`: The ENTIRE design system. Must preserve OKLCH tokens exactly (they're the color identity), preserve grid overlay (it's the visual signature), preserve ambient glow. Must NOT keep dashboard layout classes that don't apply to a landing page.

  **Acceptance Criteria**:
  - [ ] `apps/web/src/styles.css` exists with all `:root` CSS variables matching HQ
  - [ ] OKLCH values in `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--accent`, `--destructive`, `--border` match HQ exactly (byte-for-byte)
  - [ ] Font import includes `display=swap` parameter
  - [ ] `body::before` grid overlay present with 36px grid, 0.18 opacity, radial mask
  - [ ] No `.hq-*` class names in the file
  - [ ] No `.auth-*` class names in the file
  - [ ] No `.recharts-*` class names in the file
  - [ ] `@import "tailwindcss"` and `@plugin "@tailwindcss/typography"` present

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Design tokens match HQ exactly
    Tool: Bash
    Preconditions: styles.css created
    Steps:
      1. Run `diff <(grep -E "^  --[a-z-]+:" apps/hq/src/styles.css | head -42) <(grep -E "^  --[a-z-]+:" apps/web/src/styles.css | head -42)`
      2. Assert diff is empty (0 lines differ) — core color tokens match byte-for-byte
      3. Run `grep "display=swap" apps/web/src/styles.css`
      4. Assert match found
      5. Run `grep -c "\.hq-" apps/web/src/styles.css`
      6. Assert count is 0
    Expected Result: All CSS custom properties match HQ, font-display=swap present, no .hq- classes
    Failure Indicators: Diff shows changed color values, missing display=swap, leftover .hq- classes
    Evidence: .sisyphus/evidence/task-2-tokens-match.txt

  Scenario: Grid overlay and body styles preserved
    Tool: Bash
    Preconditions: styles.css created
    Steps:
      1. Run `grep "background-size: 36px 36px" apps/web/src/styles.css`
      2. Assert match found
      3. Run `grep "radial-gradient" apps/web/src/styles.css | wc -l`
      4. Assert at least 3 lines (2 body gradients + 1 mask gradient)
      5. Run `grep "@import \"tailwindcss\"" apps/web/src/styles.css`
      6. Assert match found
    Expected Result: Grid overlay, ambient glow, and Tailwind imports all present
    Failure Indicators: Missing grid overlay, missing gradients, missing Tailwind import
    Evidence: .sisyphus/evidence/task-2-grid-overlay.txt
  ```

  **Commit**: YES (groups with this task only)
  - Message: `feat(web): add design tokens and global styles`
  - Files: `apps/web/src/styles.css`
  - Pre-commit: `oxfmt --check apps/web`

- [x] 3. Static assets (favicon/icon suite)

  **What to do**:
  - Create `apps/web/public/` directory
  - Copy the user-provided favicon/icon assets into `apps/web/public/`:
    - `android-icon-36x36.png` through `android-icon-192x192.png`
    - `apple-icon-57x57.png` through `apple-icon-180x180.png`
    - `apple-icon-precomposed.png`, `apple-icon.png`
    - `favicon-16x16.png`, `favicon-32x32.png`, `favicon-96x96.png`
    - `ms-icon-70x70.png` through `ms-icon-310x310.png`
    - `browserconfig.xml`, `manifest.json`
    - Any other icon files provided by the user
  - Note: The user provided these files attached to the conversation but they couldn't be viewed (image format not supported). They should be placed directly in `public/`.
  - Update `manifest.json` to set `"name": "Parley"` (the current file says "App")
  - Do NOT create `site.webmanifest` — use the provided `manifest.json` instead

  **Must NOT do**:
  - Do NOT create custom illustrations or hero images
  - Do NOT modify the actual icon image files (place them as-is)
  - Do NOT generate new icon variants

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File copy + minor JSON edit, no complex logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent of T2 styles, but both need T1 scaffold)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7 (root layout needs favicon links)
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `apps/hq/public/` — Check what favicon/icon files HQ uses for reference on how they're referenced in the root layout

  **WHY Each Reference Matters**:
  - HQ's public folder shows the file naming convention and how `__root.tsx` references them

  **Acceptance Criteria**:
  - [ ] `apps/web/public/` contains all provided icon files
  - [ ] `apps/web/public/manifest.json` has `"name": "Parley"` (not "App")
  - [ ] `apps/web/public/browserconfig.xml` exists and is valid XML

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All favicon/icon assets present
    Tool: Bash
    Preconditions: Files copied to public/
    Steps:
      1. Run `ls apps/web/public/ | wc -l`
      2. Assert count is at least 20 (icon variants + manifest + browserconfig)
      3. Run `grep '"name"' apps/web/public/manifest.json`
      4. Assert output contains "Parley" (not "App")
      5. Run `file apps/web/public/favicon-32x32.png`
      6. Assert file exists and is PNG
    Expected Result: All icon files present, manifest updated to "Parley", favicons are valid PNGs
    Failure Indicators: Missing files, manifest still says "App", corrupt image files
    Evidence: .sisyphus/evidence/task-3-static-assets.txt
  ```

  **Commit**: YES (groups with this task only)
  - Message: `feat(web): add favicon and icon assets`
  - Files: `apps/web/public/*`

- [x] 4. UI components (Button, Badge, Card, cn utility)

  **What to do**:
  - Copy `apps/hq/src/lib/utils.ts` to `apps/web/src/lib/utils.ts` — this is just the `cn()` utility (clsx + tailwind-merge)
  - Copy and adapt `apps/hq/src/components/ui/button.tsx` to `apps/web/src/components/ui/button.tsx`:
    - Keep all variants (default, destructive, outline, secondary, ghost, link)
    - Keep all sizes (default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg)
    - Update import paths from `#/lib/utils` to use local path if needed
  - Copy and adapt `apps/hq/src/components/ui/badge.tsx` to `apps/web/src/components/ui/badge.tsx`:
    - Keep all variants (default, secondary, destructive, outline, ghost, link)
    - Update import path for `cn`
  - Copy and adapt `apps/hq/src/components/ui/card.tsx` to `apps/web/src/components/ui/card.tsx`:
    - Keep Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
    - Update import path for `cn`
  - DO NOT copy: Select, Table, Chart, Skeleton, Separator, Tabs, or any other HQ component

  **Must NOT do**:
  - Do NOT copy any components other than Button, Badge, Card, and utils
  - Do NOT create a `packages/ui` shared package
  - Do NOT modify the component APIs (variants, sizes) — keep them identical to HQ

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Copy-paste with import path adjustments, no design decisions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run alongside T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References** (CRITICAL):

  **Pattern References**:
  - `apps/hq/src/lib/utils.ts` — The `cn()` utility function (clsx + tailwind-merge). Copy as-is, just update any imports if needed.
  - `apps/hq/src/components/ui/button.tsx` — Button component with CVA variants. Copy completely, update import path for `cn` from `#/lib/utils` to local path.
  - `apps/hq/src/components/ui/badge.tsx` — Badge component with CVA variants. Copy completely, update import path.
  - `apps/hq/src/components/ui/card.tsx` — Card component with subcomponents. Copy completely, update import path.

  **WHY Each Reference Matters**:
  - These are the 3 UI components the landing page needs. They must match HQ exactly (same variants, same sizes, same class names) so the visual identity is preserved. The `cn()` utility is a dependency for all of them.

  **Acceptance Criteria**:
  - [ ] `apps/web/src/lib/utils.ts` exists and exports `cn` function
  - [ ] `apps/web/src/components/ui/button.tsx` exists with all 6 variants and 7 sizes
  - [ ] `apps/web/src/components/ui/badge.tsx` exists with all 6 variants
  - [ ] `apps/web/src/components/ui/card.tsx` exists with Card, CardHeader, CardTitle, CardContent, CardFooter
  - [ ] All imports resolve correctly (no `#/lib/utils` import errors)
  - [ ] `bun run typecheck --filter=@parley/web` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: UI components typecheck and match HQ
    Tool: Bash
    Preconditions: All component files created
    Steps:
      1. Run `bun run typecheck --filter=@parley/web`
      2. Assert exit code 0
      3. Run `ls apps/web/src/components/ui/button.tsx apps/web/src/components/ui/badge.tsx apps/web/src/components/ui/card.tsx apps/web/src/lib/utils.ts`
      4. Assert all 4 files exist
      5. Run `grep -c "variant:" apps/web/src/components/ui/button.tsx`
      6. Assert count >= 6 (6 variants)
      7. Run `grep -c "size:" apps/web/src/components/ui/button.tsx`
      8. Assert count >= 1 (size variants defined)
    Expected Result: All 4 files exist, typecheck passes, Button has 6+ variants
    Failure Indicators: Typecheck fails, missing files, wrong import paths
    Evidence: .sisyphus/evidence/task-4-ui-components.txt
  ```

  **Commit**: YES (groups with this task only)
  - Message: `feat(web): add UI components (Button, Badge, Card)`
  - Files: `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/badge.tsx`, `apps/web/src/components/ui/card.tsx`, `apps/web/src/lib/utils.ts`
  - Pre-commit: `bun run typecheck --filter=@parley/web`

- [x] 5. Command reference data file

  **What to do**:
  - Create `apps/web/src/data/commands.ts` with a typed export containing all 9 slash commands organized by the 5 help categories
  - Data structure should be:
    ```ts
    export interface CommandOption {
      name: string;
      description: string;
      required: boolean;
      choices?: string[];
      autocomplete?: boolean;
    }
    export interface Subcommand {
      name: string;
      description: string;
      options?: CommandOption[];
    }
    export interface Command {
      name: string;
      description: string;
      subcommands?: Subcommand[];
      options?: CommandOption[];
    }
    export interface CommandCategory {
      title: string;
      description: string;
      commands: Command[];
    }
    export const commandCategories: CommandCategory[];
    ```
  - Populate with data from the actual codebase:
    - **Account** (Page 1): `account register`, `account unregister`, `account me`, `account refresh`, `stats`
    - **Teaming** (Page 2): `team create`, `queue start`, `queue status`, `queue cancel`, `ping`
    - **Tournaments I** (Page 3): `tournament create`, `tournament browse`, `tournament view`, `tournament join`, `tournament leave`
    - **Tournaments II / Admin** (Page 4): `tournament start`, `tournament cancel`, `tournament forfeit`, `limit set`, `limit clear`, `limit show`
    - **Utility / Admin** (Page 5): `leaderboard`, `help`
  - For each command/subcommand, include:
    - Name (e.g., `"account register"`)
    - Description (e.g., `"Register your R6 account for this server"`)
    - Options where applicable (e.g., `username: string (required)`, `platform: auto|pc|xbox|playstation`)
  - Source all descriptions from the actual command handler files in `apps/worker/src/interactions/`
  - Export the data as a typed constant

  **Must NOT do**:
  - Do NOT import from `@parley/core` or any other workspace package
  - Do NOT make this data dynamic (no API calls, no database queries)
  - Do NOT add commands that don't exist in the codebase
  - Do NOT invent descriptions — use the actual descriptions from the command handlers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Data entry from existing source files, well-structured TypeScript types
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent of T4, T6, T7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `apps/worker/src/interactions/account.ts` — `/account` subcommands: register (username, platform options), unregister, me, refresh. Read each APPLICATION_COMMAND definition to extract name + description + options.
  - `apps/worker/src/interactions/stats.ts` — `/stats` command: username (required), platform (auto/pc/xbox/playstation), season (autocomplete)
  - `apps/worker/src/interactions/leaderboard.ts` — `/leaderboard` command: scope (server/global), platform (all/pc/xbox/playstation), min_matches (0-500)
  - `apps/worker/src/interactions/team.ts` — `/team create`, `/queue start|status|cancel`, `/limit set|clear|show`, `/tournament create|browse|view|join|leave|start|cancel|forfeit`. Read ALL subcommand definitions.
  - `apps/worker/src/interactions/help.ts` — Help page organization (5 categories). This confirms the categorization.
  - `apps/worker/src/interactions/ping.ts` — `/ping` command: simple latency check

  **WHY Each Reference Matters**:
  - These files contain the EXACT command names, descriptions, and option definitions as they appear in Discord. The landing page must show the real command interface, not invented descriptions. The help.ts file confirms the category organization.

  **Acceptance Criteria**:
  - [ ] `apps/web/src/data/commands.ts` exists and exports `commandCategories`
  - [ ] All 9 top-level commands are present: account, stats, leaderboard, team, queue, limit, tournament, help, ping
  - [ ] All 5 categories are present: Account, Teaming, Tournaments I, Tournaments II/Admin, Utility/Admin
  - [ ] `bun run typecheck --filter=@parley/web` passes
  - [ ] No imports from workspace packages (`@parley/*`)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Command data completeness
    Tool: Bash
    Preconditions: commands.ts created
    Steps:
      1. Run `grep -c "name:" apps/web/src/data/commands.ts`
      2. Assert count >= 28 (9 commands + ~19 subcommands)
      3. Run `grep "account" apps/web/src/data/commands.ts | wc -l`
      4. Assert count >= 4 (4 account subcommands)
      5. Run `grep "tournament" apps/web/src/data/commands.ts | wc -l`
      6. Assert count >= 8 (8 tournament subcommands)
      7. Run `grep -c "@parley/" apps/web/src/data/commands.ts`
      8. Assert count is 0 (no workspace imports)
    Expected Result: All commands and subcommands present, no workspace package imports
    Failure Indicators: Missing commands, wrong subcommand count, accidental @parley imports
    Evidence: .sisyphus/evidence/task-5-commands-data.txt
  ```

  **Commit**: YES (groups with this task only)
  - Message: `feat(web): add command reference data`
  - Files: `apps/web/src/data/commands.ts`
  - Pre-commit: `bun run typecheck --filter=@parley/web`

- [x] 6. Discord message mock component

  **What to do**:
  - Create `apps/web/src/components/discord-mock.tsx` — a visual component that renders a Discord-like message showing team balancing output with fake ELO data
  - The mock should look like a Discord message embed showing:
    - A header like "Team Balance" with a timestamp
    - Two teams (Team Alpha and Team Bravo) with 5 players each
    - Each player row: username, platform badge (PC/Xbox/PlayStation), ELO rating, rank
    - Team average ELO and ELO gap indicator
    - A "Match recorded" footer
  - Use hardcoded fake data — NO imports from `@parley/core`
  - Style the mock to match Discord's visual language (dark embed, left color bar, Author name, thumbnail area, field layout)
  - Use the HQ design tokens from `styles.css` (the dark background, card colors, borders)
  - Make the mock responsive — stack teams vertically on mobile, side-by-side on desktop
  - This is a STATIC visual component. No interactivity, no state management, no animation beyond CSS hover/focus

  **Fake data to use**:

  ```
  Team Alpha (Avg ELO: 1,247):
    - AshMain (PC) — ELO 1,384, Gold II
    - VigilPlayer (PC) — ELO 1,295, Silver I
    - PulseOps (Xbox) — ELO 1,210, Gold III
    - EchoStrike (PlayStation) — ELO 1,152, Silver III
    - SledgePhD (PC) — ELO 1,194, Gold IV

  Team Bravo (Avg ELO: 1,229):
    - JägerBomb (PC) — ELO 1,402, Gold I
    - CaveiraX (Xbox) — ELO 1,267, Silver I
    - Thermite4Days (PC) — ELO 1,198, Gold IV
    - ValkyrieEye (PlayStation) — ELO 1,134, Bronze I
    - RookSolid (PC) — ELO 1,144, Silver II

  Gap: 18 ELO (Well Balanced)
  ```

  **Must NOT do**:
  - Do NOT import from `@parley/core` or any workspace package
  - Do NOT add interactivity (no buttons to click, no state toggles)
  - Do NOT add animation libraries or scroll-triggered effects
  - Do NOT make the data dynamic or fetch from an API

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with styling — needs design sensitivity to match Discord's embed aesthetic within HQ's design system
  - **Skills**: [`/frontend-design`]
    - `frontend-design`: Creating a visual component that bridges Discord's design language with the HQ dark theme

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent of T4, T5, T7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References** (CRITICAL):

  **Pattern References**:
  - `apps/hq/src/styles.css` — The design tokens (OKLCH colors, fonts, borders). Use `var(--card)` for embed background, `var(--border)` for separators, `var(--foreground)` for text, `var(--muted-foreground)` for secondary text. The grid overlay and ambient glow from `body` styles will show through naturally.
  - `apps/hq/src/components/ui/card.tsx` — The Card component structure. The Discord mock embed can use a modified Card variant or custom styling.
  - `apps/hq/src/components/ui/badge.tsx` — For platform badges (PC, Xbox, PlayStation) styled as small badges.

  **External References**:
  - Discord embed visual reference: A Discord embed has a left colored bar (~4px), dark background (#2f3136), rounded corners, author line, title, description, fields (inline or stacked), footer with timestamp.

  **WHY Each Reference Matters**:
  - `styles.css`: All color tokens must match — this is the primary visual identity connector to HQ
  - `card.tsx`: Shows how cards are structured in the design system, can be extended for the Discord mock
  - `badge.tsx`: Platform labels should use badge styling for visual consistency

  **Acceptance Criteria**:
  - [ ] `apps/web/src/components/discord-mock.tsx` exists and exports a React component
  - [ ] Component renders two teams with 5 players each
  - [ ] Each player shows: username, platform badge, ELO rating, rank
  - [ ] Shows team average ELO and gap
  - [ ] No `@parley/*` imports
  - [ ] `bun run typecheck --filter=@parley/web` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Discord mock component typechecks
    Tool: Bash
    Preconditions: discord-mock.tsx created
    Steps:
      1. Run `bun run typecheck --filter=@parley/web`
      2. Assert exit code 0
      3. Run `grep -c "@parley/" apps/web/src/components/discord-mock.tsx`
      4. Assert count is 0
      5. Run `grep "Team Alpha\|Team Bravo" apps/web/src/components/discord-mock.tsx | wc -l`
      6. Assert count >= 2
      7. Run `grep "ELO\|elo" apps/web/src/components/discord-mock.tsx | wc -l`
      8. Assert count >= 3 (team averages + gap)
    Expected Result: Component typechecks, no workspace imports, teams and ELO data present
    Failure Indicators: Type errors, workspace imports found, missing team data
    Evidence: .sisyphus/evidence/task-6-discord-mock.txt
  ```

  **Commit**: YES (groups with this task only)
  - Message: `feat(web): add Discord message mock component`
  - Files: `apps/web/src/components/discord-mock.tsx`
  - Pre-commit: `bun run typecheck --filter=@parley/web`

- [x] 7. Root layout + hero section

  **What to do**:
  - Update `apps/web/src/routes/__root.tsx` to create a complete root layout:
    - Import Google Fonts with `display=swap`: Space Grotesk (400, 500, 700) + IBM Plex Mono (400, 500)
    - Import `../styles.css`
    - Set `<html class="dark">` — dark mode only, no toggle
    - Add `head` function with meta tags: title "Parley — Competitive Siege, Made Simple", description, OG tags, Twitter card, canonical URL
    - Add favicon links referencing `/android-icon-192x192.png`, `/apple-icon.png`, `/favicon-32x32.png`, `/favicon-16x16.png`, `/manifest.json`
    - Add viewport meta, theme-color meta (`#0d0e10` matching background)
    - Body with `<Outlet />` and TanStack Start's `<Scripts />`
  - Create `apps/web/src/components/hero.tsx` — the hero section component:
    - Bot name "PARLEY" in large uppercase display text (use `.lp-hero` or Tailwind classes matching `.hq-title` style: `clamp(2.4rem, 5vw, 4.8rem)`, `letter-spacing: -0.06em`, `text-transform: uppercase`, `font-weight: 700`)
    - Tagline: "Competitive Siege, Made Simple" or similar
    - Subtitle: 1-2 lines describing the bot (ELO tracking, cross-server matchmaking, tournaments)
    - Primary CTA: Discord invite button (use Button component, variant="default", linking to Discord OAuth2 invite URL — use placeholder `https://discord.com/oauth2/authorize?client_id=PLACEHOLDER` for now)
    - Secondary CTA: "View Commands" scroll link (smooth scroll to command reference section)
    - Layout: Use the ambient grid/glow background (comes from body styles), content in center-left aligned container
    - Use Badge component for feature highlights: "Cross-Server", "ELO Tracking", "Tournaments"

  **Must NOT do**:
  - Do NOT add a light mode toggle
  - Do NOT add animation libraries or scroll-triggered effects
  - Do NOT use the `.hq-*` CSS class prefix
  - Do NOT add auth or session management

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Hero section is the first impression — needs design sensitivity to match HQ aesthetic while being a distinct landing page layout
  - **Skills**: [`/frontend-design`]
    - `frontend-design`: Creating visually compelling hero section with CTAs, badges, and responsive layout

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T2 styles, T3 assets)
  - **Parallel Group**: Wave 2 (after T1, T2, T3)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2, 3

  **References** (CRITICAL):

  **Pattern References**:
  - `apps/hq/src/routes/__root.tsx` — Root layout pattern (html dark class, head meta, Outlet, Scripts). Follow the TanStack Start root route structure but adapt meta for landing page.
  - `apps/hq/src/styles.css` lines 125-146 — `.hq-shell`, `.hq-header`, `.hq-title`, `.hq-subtitle` patterns to adapt for `.lp-hero` layout.
  - `apps/hq/src/styles.css` lines 154-159 — `.hq-actions` pattern for CTA button layout.
  - `apps/hq/src/styles.css` lines 161-171 — `.hq-badge` pattern for feature highlight badges.

  **WHY Each Reference Matters**:
  - `__root.tsx`: Shows how TanStack Start root routes are structured (head function, html class, font imports)
  - `.hq-title`: The display typography pattern — we need the same visual weight but adapted for a landing page hero
  - `.hq-actions` and `.hq-badge`: Layout patterns for CTAs and feature badges

  **Acceptance Criteria**:
  - [ ] `apps/web/src/routes/__root.tsx` imports styles.css and sets `class="dark"` on html
  - [ ] Font import includes `display=swap` parameter
  - [ ] Favicon links reference `/android-icon-192x192.png`, `/favicon-32x32.png`, `/manifest.json`
  - [ ] Hero section renders "PARLEY" in uppercase display text
  - [ ] Discord invite CTA button is present with href to Discord OAuth2
  - [ ] Badge elements show feature highlights (Cross-Server, ELO Tracking, Tournaments)
  - [ ] `bun run typecheck --filter=@parley/web` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Root layout and hero typecheck
    Tool: Bash
    Preconditions: __root.tsx and hero.tsx created
    Steps:
      1. Run `bun run typecheck --filter=@parley/web`
      2. Assert exit code 0
      3. Run `grep "class=\"dark\"" apps/web/src/routes/__root.tsx`
      4. Assert match found
      5. Run `grep "display=swap" apps/web/src/routes/__root.tsx`
      6. Assert match found OR `display=swap` is in styles.css font import
      7. Run `grep "PARLEY" apps/web/src/components/hero.tsx`
      8. Assert match found (hero text present)
      9. Run `grep "discord.com/oauth2" apps/web/src/components/hero.tsx`
      10. Assert match found (invite link present)
    Expected Result: Typecheck passes, dark mode class present, fonts with swap, hero text and invite link present
    Failure Indicators: Type errors, missing dark class, missing invite link
    Evidence: .sisyphus/evidence/task-7-root-hero.txt
  ```

  **Commit**: YES (groups with this task only)
  - Message: `feat(web): add root layout and hero section`
  - Files: `apps/web/src/routes/__root.tsx`, `apps/web/src/components/hero.tsx`
  - Pre-commit: `bun run typecheck --filter=@parley/web`

- [x] 8. Landing page assembly (all sections)

  **What to do**:
  - Update `apps/web/src/routes/index.tsx` to compose the full landing page with these sections in order:
    1. **Hero** (import from `hero.tsx`) — already built in T7
    2. **Features** — Create `apps/web/src/components/features.tsx`:
       - Section title: "Features" or "Built for Competitive Siege"
       - 6 feature cards in a responsive grid (3 cols desktop, 2 cols tablet, 1 col mobile):
         1. **Internal ELO** — "Track skill independently of Ubisoft ranks. Your ELO reflects actual match outcomes, not just ranked points."
         2. **Cross-Server Matchmaking** — "Queue your 5-stack against teams from other servers. No more waiting for in-house opponents."
         3. **Tournament System** — "Create and join public tournaments — single or double elimination, up to 32 teams, with auto-bracket generation."
         4. **Smart Seeding** — "New players get ELO estimated from ranked stats. No placement grind — jump in and compete."
         5. **Multi-Platform** — "PC, Xbox, and PlayStation. Auto-detect platform or choose manually. One account across all servers."
         6. **Verified Results** — "Both captains submit match results. No one-sided reporting — integrity built in."
       - Each card: icon (from lucide-react), title, description
       - Use Card component from UI with `.hq-card` style adaptation (gradient overlay, inset highlight)
    3. **Discord Mock** (import from `discord-mock.tsx`) — already built in T6
       - Add section title: "See It In Action" or "Team Balancing, Visualized"
       - Wrap in centered container with subtle horizontal rules/padding
    4. **Command Reference** — Create `apps/web/src/components/command-reference.tsx`:
       - Section title: "Commands" or "Command Reference"
       - Import `commandCategories` from `data/commands.ts`
       - Render 5 categories as collapsible sections or tab panels
       - Each category shows its title and commands
       - Each command shows: name with `/` prefix, description, subcommands if any, options if any
       - Use Badge for command types, monospace font (`font-mono`) for command syntax
       - Use `@tailwindcss/typography` prose classes for descriptions
       - Responsive: single column on mobile, 2 columns on desktop
    5. **CTA/Footer** — Create `apps/web/src/components/footer.tsx`:
       - Final CTA: "Add Parley to Your Server" button (same Discord invite URL)
       - Footer: minimal — "Parley" name, year, links (optional Discord support server, GitHub if exists)
       - Use `var(--muted-foreground)` for footer text color
  - Add smooth scroll CSS for anchor links (add to `styles.css`):
    ```css
    html {
      scroll-behavior: smooth;
    }
    ```
  - Add section spacing: consistent `padding-y` between sections (e.g., `py-20 md:py-28`)
  - Add `.lp-section` class to `styles.css` for consistent section container (max-width, centered, padding)
  - Ensure all sections are responsive with proper breakpoints

  **Must NOT do**:
  - Do NOT add animation libraries or scroll-triggered effects
  - Do NOT add a separate `/commands` route — everything is on one page
  - Do NOT create a blog, changelog, or analytics section
  - Do NOT use `.hq-*` CSS class prefix

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Assembling a full marketing landing page with multiple sections, responsive layout, and design system consistency
  - **Skills**: [`/frontend-design`]
    - `frontend-design`: Landing page layout, responsive grid, feature cards, command reference UI

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T4, T5, T6, T7)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References** (CRITICAL):

  **Pattern References**:
  - `apps/hq/src/styles.css` lines 125-282 — Layout patterns (shell, header, title, filters, card, grid, footer) to adapt for landing page sections
  - `apps/web/src/data/commands.ts` — The command categories data (created in T5)
  - `apps/web/src/components/discord-mock.tsx` — The Discord mock component (created in T6)
  - `apps/web/src/components/hero.tsx` — The hero section (created in T7)
  - `apps/web/src/components/ui/card.tsx` — For feature cards
  - `apps/web/src/components/ui/badge.tsx` — For command type labels and feature tags
  - `apps/web/src/components/ui/button.tsx` — For CTA buttons

  **External References**:
  - `lucide-react` icons: Use `Swords`, `Users`, `Trophy`, `Zap`, `Monitor`, `ShieldCheck` (or similar) for the 6 feature cards

  **WHY Each Reference Matters**:
  - `styles.css` patterns: The section layout (shell, header, grid) patterns show how to structure responsive sections in the HQ aesthetic
  - `commands.ts`: The data source for the command reference section
  - `discord-mock.tsx` and `hero.tsx`: Already built components that need to be composed
  - UI components: Reused for consistency across all sections

  **Acceptance Criteria**:
  - [ ] `apps/web/src/routes/index.tsx` imports and renders Hero, Features, DiscordMock, CommandReference, and Footer
  - [ ] Features section shows all 6 differentiators with icons and descriptions
  - [ ] Command reference shows all 5 categories with all 9 commands
  - [ ] Footer has Discord invite CTA and minimal text
  - [ ] `bun run typecheck --filter=@parley/web` passes
  - [ ] `oxlint apps/web` passes with zero errors
  - [ ] `oxfmt --check apps/web` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Landing page renders all sections
    Tool: Playwright
    Preconditions: `bun run build --filter=@parley/web` succeeds, dev server running on port 3001
    Steps:
      1. Navigate to `http://localhost:3001`
      2. Assert page title contains "Parley"
      3. Scroll through page and verify sections in order: Hero, Features, Discord Mock, Command Reference, Footer
      4. Assert "PARLEY" text visible in hero
      5. Assert at least 6 feature cards visible
      6. Assert "Team Alpha" and "Team Bravo" text visible in Discord mock
      7. Assert "/account" command visible in command reference
      8. Assert "/tournament" command visible in command reference
      9. Assert "Add Parley" or similar CTA text visible in footer
      10. Screenshot full page at 1440px width
    Expected Result: All 5 sections render correctly with expected content
    Failure Indicators: Missing sections, empty content, layout breakage, type errors
    Evidence: .sisyphus/evidence/task-8-landing-page.png

  Scenario: Command reference completeness
    Tool: Bash
    Preconditions: index.tsx and command-reference.tsx created
    Steps:
      1. Run `grep "commandCategories" apps/web/src/components/command-reference.tsx`
      2. Assert import found
      3. Run `grep "Account\|Teaming\|Tournaments I\|Tournaments II\|Utility" apps/web/src/components/command-reference.tsx | wc -l`
      4. Assert count >= 5 (all categories referenced)
    Expected Result: Command reference imports data and covers all 5 categories
    Failure Indicators: Missing categories, missing data import
    Evidence: .sisyphus/evidence/task-8-commands-complete.txt
  ```

  **Commit**: YES (groups with this task only)
  - Message: `feat(web): assemble landing page with all sections`
  - Files: `apps/web/src/routes/index.tsx`, `apps/web/src/components/features.tsx`, `apps/web/src/components/command-reference.tsx`, `apps/web/src/components/footer.tsx`, `apps/web/src/styles.css` (additions)
  - Pre-commit: `bun run typecheck --filter=@parley/web && oxlint apps/web && oxfmt --check apps/web`

- [x] 9. Build verification + responsive QA

  **What to do**:
  - Run `bun install` from workspace root
  - Run `bun run build --filter=@parley/web` — fix any build errors
  - Run `bun run typecheck --filter=@parley/web` — fix any type errors
  - Run `oxlint apps/web` — fix any lint errors
  - Run `oxfmt --check apps/wb` — fix any formatting issues
  - Run `bun run dev --filter=@parley/web` and manually verify:
    - Page loads at `http://localhost:3000` (or configured port)
    - Hero section renders with "PARLEY" text
    - Features section shows 6 cards in responsive grid
    - Discord mock renders with team data
    - Command reference shows all 9 commands in 5 categories
    - Footer shows CTA and links
  - Take responsive screenshots:
    - Mobile (375px width)
    - Tablet (768px width)
    - Desktop (1440px width)
  - Verify no horizontal overflow on any viewport
  - Verify all links are valid (Discord invite URL, internal anchors)
  - Verify favicon renders in browser tab
  - Check for any `console.log` statements in production code — remove them

  **Must NOT do**:
  - Do NOT modify functional behavior — only fix build/lint/format errors
  - Do NOT add new features or sections
  - Do NOT skip linting or formatting checks

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Thorough verification across build, typecheck, lint, format, and visual QA — requires systematic attention
  - **Skills**: [`/playwright`]
    - `playwright`: For responsive screenshots and visual verification

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all previous tasks)
  - **Parallel Group**: Wave 3 (after T8)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 8

  **References** (CRITICAL):

  **Pattern References**:
  - `apps/hq/` — Compare build/lint commands: `bun run build`, `bun run typecheck`, `oxlint .`, `oxfmt --check .`
  - Root `package.json` — Scripts for `build:web`, `typecheck` via turbo

  **WHY Each Reference Matters**:
  - HQ app shows how the same toolchain is configured and what passing checks look like. The web app must pass identical checks.

  **Acceptance Criteria**:
  - [ ] `bun run build --filter=@parley/web` succeeds with exit code 0
  - [ ] `bun run typecheck --filter=@parley/web` passes with zero errors
  - [ ] `oxlint apps/web` passes with zero errors
  - [ ] `oxfmt --check apps/web` passes
  - [ ] No `@parley/db`, `@parley/auth`, or `@parley/core` imports in `apps/web/src/`
  - [ ] Responsive screenshots captured at 375px, 768px, and 1440px
  - [ ] No horizontal overflow on any viewport
  - [ ] All 9 commands visible in command reference
  - [ ] Discord mock visible with team data

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full build pipeline passes
    Tool: Bash
    Preconditions: All source files complete
    Steps:
      1. Run `bun run build --filter=@parley/web` from workspace root
      2. Assert exit code 0
      3. Run `bun run typecheck --filter=@parley/web` from workspace root
      4. Assert exit code 0
      5. Run `oxlint apps/web`
      6. Assert exit code 0
      7. Run `oxfmt --check apps/web`
      8. Assert exit code 0
      9. Run `ls apps/web/dist/`
      10. Assert dist directory exists with output files
    Expected Result: Build, typecheck, lint, and format all pass without errors
    Failure Indicators: Build fails, type errors, lint errors, format errors, empty dist/
    Evidence: .sisyphus/evidence/task-9-build-pipeline.txt

  Scenario: No forbidden imports
    Tool: Bash
    Preconditions: Build passes
    Steps:
      1. Run `grep -r "@parley/db\|@parley/auth\|@parley/core" apps/web/src/`
      2. Assert empty output (no matches)
      3. Run `grep "hyperdrive\|kv_namespaces\|queues" apps/web/wrangler.jsonc | grep -v "//\|/\*"`
      3. Assert empty output (no server bindings)
    Expected Result: Zero forbidden imports, zero server bindings
    Failure Indicators: Any @parley/db/auth/core imports found, server bindings in wrangler
    Evidence: .sisyphus/evidence/task-9-no-forbidden-imports.txt

  Scenario: Responsive verification
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Set viewport to 375x812 (mobile)
      2. Navigate to landing page
      3. Assert no horizontal scrollbar (viewport width >= document width)
      4. Screenshot: .sisyphus/evidence/task-9-mobile.png
      5. Set viewport to 768x1024 (tablet)
      6. Assert no horizontal scrollbar
      7. Screenshot: .sisyphus/evidence/task-9-tablet.png
      8. Set viewport to 1440x900 (desktop)
      9. Assert no horizontal scrollbar
      10. Screenshot: .sisyphus/evidence/task-9-desktop.png
      11. Assert "PARLEY" visible on all viewports
      12. Assert feature cards render (at least 1 visible on mobile, 3+ on desktop)
    Expected Result: Page renders correctly at all 3 viewpoints, no overflow
    Failure Indicators: Horizontal scroll, missing sections, broken layout, content overflow
    Evidence: .sisyphus/evidence/task-9-mobile.png, task-9-tablet.png, task-9-desktop.png
  ```

  **Commit**: YES (groups with this task only)
  - Message: `chore(web): verify build and responsive QA`
  - Files: Evidence files only
  - Pre-commit: `bun run typecheck --filter=@parley/web && oxlint apps/web && oxfmt --check apps/web`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check command output). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `bun run typecheck --filter=@parley/web`, `oxlint apps/web`, `oxfmt --check apps/web`. Review all files in `apps/web/src/` for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Format [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state (`bun install && bun run build --filter=@parley/web && bun run dev --filter=@parley/web`). Open in Playwright. Verify: hero section renders with bot name + invite CTA, features section shows all 6 differentiators, Discord mock renders with two teams and fake ELO, command reference shows all 9 commands in 5 categories, footer has invite link. Test responsive: take screenshots at 375px, 768px, 1440px. Save all screenshots to `.sisyphus/evidence/final-qa/`.
      Output: `Sections [5/5] | Responsive [3/3] | Commands [9/9] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                              | Files                                                                                                                                                          |
| ------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `feat(web): scaffold @parley/web package`            | `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/wrangler.jsonc`, `apps/web/tsconfig.json`, `turbo.json`, root `package.json`                     |
| 2      | `feat(web): add design tokens and global styles`     | `apps/web/src/styles.css`, `apps/web/src/routes/__root.tsx`                                                                                                    |
| 3      | `feat(web): add favicon and icon assets`             | `apps/web/public/*`                                                                                                                                            |
| 4      | `feat(web): add UI components (Button, Badge, Card)` | `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/badge.tsx`, `apps/web/src/components/ui/card.tsx`, `apps/web/src/lib/utils.ts`            |
| 5      | `feat(web): add command reference data`              | `apps/web/src/data/commands.ts`                                                                                                                                |
| 6      | `feat(web): add Discord message mock component`      | `apps/web/src/components/discord-mock.tsx`                                                                                                                     |
| 7      | `feat(web): add root layout and hero section`        | `apps/web/src/routes/__root.tsx`, `apps/web/src/components/hero.tsx`                                                                                           |
| 8      | `feat(web): assemble landing page with all sections` | `apps/web/src/routes/index.tsx`, `apps/web/src/components/features.tsx`, `apps/web/src/components/command-reference.tsx`, `apps/web/src/components/footer.tsx` |
| 9      | `chore(web): verify build and responsive QA`         | Evidence files                                                                                                                                                 |

---

## Success Criteria

### Verification Commands

```bash
bun run typecheck --filter=@parley/web        # Expected: 0 errors
oxlint apps/web                                 # Expected: 0 errors
oxfmt --check apps/web                          # Expected: pass
bun run build --filter=@parley/web              # Expected: success, dist/ output
grep -r "@parley/db\|@parley/auth\|@parley/core" apps/web/src/  # Expected: empty (no matches)
grep -c "hyperdrive\|kv_namespaces\|queues" apps/web/wrangler.jsonc  # Expected: 0
```

### Final Checklist

- [ ] All "Must Have" items present (OKLCH tokens, fonts, grid overlay, ambient glow, invite CTA, 9 commands, Discord mock, responsive breakpoints, favicon suite)
- [ ] All "Must NOT Have" items absent (no db imports, no auth, no animations lib, no shared UI pkg, no API routes)
- [ ] Page renders correctly at 375px, 768px, 1024px, 1440px viewports
- [ ] All 9 slash commands appear in the command reference section
