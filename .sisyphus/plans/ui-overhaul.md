# UI Overhaul: Shadcn Preset `buFzFmS` for apps/web

## TL;DR

> **Quick Summary**: Overhaul the entire `apps/web` UI by initializing shadcn/ui with the `buFzFmS` preset (full lyra style, hugeicons, jetbrains-mono), overriding colors to grey/white only, replacing all custom UI components with official shadcn/ui equivalents, adding a Discord login flow to `/dashboard`, and optimizing performance by removing heavy CSS effects, implementing route-based lazy loading, and reducing bundle size.
>
> **Deliverables**:
>
> - shadcn/ui initialized in `apps/web` with `components.json`
> - Preset `buFzFmS` applied (lyra style, hugeicons, jetbrains-mono)
> - Grey/white dark theme (no vibrant colors)
> - All custom UI components replaced with shadcn/ui equivalents
> - Discord OAuth login on `/dashboard`
> - Route-based code splitting with lazy loading
> - Optimized CSS (removed blur/noise, kept performant animations)
> - Updated landing page, leaderboard, and dashboard pages
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: Task 1 → Task 2 → Task 5 → Task 8-13 → Task 14-17 → Task 18-20 → F1-F4

---

## Context

### Original Request

Overhaul the entire UI of `apps/web` using the Shadcn UI preset `buFzFmS`. Dark grey/white theme only (no vibrant colors). Fast and performant. Add a login page with the Discord icon. Optimize code to be more performant and faster. Use skills in `.agents/skills`.

### Interview Summary

**Key Discussions**:

- **Theme**: Dark vibes only — grey and white on dark background (no blue/cyan accents)
- **Preset**: Apply full `buFzFmS` preset including lyra style, hugeicons, and jetbrains-mono
- **Login**: In `/dashboard` route, official Discord "Log in with Discord" button using existing better-auth OAuth
- **Performance**: Remove heavy CSS effects, implement route-based code splitting, lazy loading, reduce bundle size
- **Components**: Replace all existing custom UI components with official shadcn/ui components
- **Tests**: No unit tests needed

**Research Findings**:

- Current stack: Vite 8 + React 19 + TanStack Start + Tailwind CSS v4.1.18
- No formal shadcn/ui installation (no `components.json`)
- Custom components: Button, Card, Badge, Separator, FloatingStatCard
- Heavy CSS: 915 lines with blue/cyan accents, glow effects, noise textures, orb animations, backdrop-filter blur
- Auth: better-auth with Discord OAuth already configured on backend
- Routes: `/`, `/leaderboard`, `/dashboard`, `/dashboard/:guildId`
- Preset `buFzFmS` decodes to: lyra style, neutral base color, hugeicons, jetbrains-mono

### Metis Review

**Identified Gaps** (addressed):

- **Icon library switch**: User confirmed switch to hugeicons
- **Lyra style risk**: User confirmed full lyra style (accepts component geometry changes)
- **Animation strategy**: User chose to optimize existing effects rather than strip all
- **Login flow**: Will use existing better-auth Discord OAuth, redirect back to `/dashboard`
- **Custom variants**: Will be recreated as extended shadcn variants where needed
- **Scope lock**: Limited to UI overhaul only — no backend changes, no new pages beyond login state

---

## Work Objectives

### Core Objective

Transform `apps/web` into a polished, performant application using shadcn/ui with the `buFzFmS` preset, featuring a grey/white dark theme, official shadcn components, Discord OAuth login, and optimized performance.

### Concrete Deliverables

- `apps/web/components.json` (shadcn configuration)
- Updated `apps/web/src/styles.css` (grey/white theme, optimized effects)
- Replaced `apps/web/src/components/ui/*.tsx` files with shadcn/ui equivalents
- Updated all page routes with new styling
- Discord login integration on `/dashboard`
- Route-based lazy loading implementation
- Performance baseline vs. post-optimization comparison

### Definition of Done

- [ ] `bun run build` succeeds without errors
- [ ] `bun run typecheck` passes
- [ ] `oxlint .` passes
- [ ] `oxfmt --check .` passes
- [ ] All routes render without console errors
- [ ] CSS file size reduced from 915 lines baseline
- [ ] Bundle size reduced from baseline
- [ ] No `backdrop-filter: blur()`, `feTurbulence`, or heavy glow shadows in CSS
- [ ] Grey/white color audit passes (no non-greyscale OKLCH/HSL values)

### Must Have

- shadcn/ui initialized with preset `buFzFmS`
- Grey/white dark theme (no vibrant accent colors)
- All custom UI components replaced with shadcn/ui
- Discord "Log in with Discord" button on `/dashboard`
- Route-based code splitting with lazy loading
- Optimized CSS (removed heavy effects, kept performant animations)
- Updated landing page, leaderboard, and dashboard styling
- Navbar updated with auth state and user menu

### Must NOT Have (Guardrails)

- No backend auth changes (backend is already configured)
- No new API routes or database changes
- No content/marketing text rewrites
- No new pages beyond auth state on `/dashboard`
- No additional animation systems beyond optimized existing ones
- No mobile breakpoint changes
- No mixing of lucide-react and hugeicons (full migration)
- Maximum 10 shadcn components installed (no "just in case" components)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: NO
- **Automated tests**: None (user explicitly declined)
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright - Navigate, interact, assert DOM, screenshot
- **Build/Bundle**: Use Bash - Run build commands, compare bundle sizes
- **Code Quality**: Use Bash - Run lint, format, typecheck
- **CSS Audit**: Use Bash/grep - Verify no heavy effects, verify greyscale-only colors

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Start Immediately):
├── Task 1: Commit state + establish performance baseline
├── Task 2: Initialize shadcn/ui with preset buFzFmS
├── Task 3: Install hugeicons and jetbrains-mono dependencies
└── Task 4: Configure shadcn components.json and project setup

Wave 2 (Theme & CSS Overhaul):
├── Task 5: Override preset colors to grey/white only
├── Task 6: Optimize CSS effects (remove heavy, keep performant)
└── Task 7: Update global styles and Tailwind theme tokens

Wave 3 (Component Migration - MAX PARALLEL):
├── Task 8: Replace Button with shadcn Button + update imports
├── Task 9: Replace Card with shadcn Card + update imports
├── Task 10: Replace Badge with shadcn Badge + update imports
├── Task 11: Replace Separator with shadcn Separator + update imports
├── Task 12: Install additional shadcn components (Avatar, Skeleton, DropdownMenu)
└── Task 13: Replace FloatingStatCard with optimized version

Wave 4 (Page Overhauls):
├── Task 14: Overhaul landing page (/) with new theme
├── Task 15: Overhaul leaderboard page
├── Task 16: Overhaul dashboard with Discord login flow
└── Task 17: Update navbar with auth state and user menu

Wave 5 (Performance Optimization):
├── Task 18: Implement route-based code splitting (lazy loading)
├── Task 19: Bundle optimization and asset cleanup
└── Task 20: Final CSS cleanup and verification

Wave FINAL (After ALL tasks - 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 5 → Task 8-13 → Task 14-17 → Task 18-20 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 6 (Wave 3)
```

### Dependency Matrix

| Task  | Blocked By | Blocks      |
| ----- | ---------- | ----------- |
| 1     | None       | 2           |
| 2     | 1          | 3, 4, 5     |
| 3     | 2          | 8-13        |
| 4     | 2          | 5-7         |
| 5     | 2, 4       | 8-13, 14-17 |
| 6     | 2, 4       | 14-17, 20   |
| 7     | 2, 4       | 14-17       |
| 8     | 3, 5       | 14-17       |
| 9     | 3, 5       | 14-17       |
| 10    | 3, 5       | 14-17       |
| 11    | 3, 5       | 14-17       |
| 12    | 3, 5       | 14-17       |
| 13    | 3, 5       | 14          |
| 14    | 5-13       | 20          |
| 15    | 5-13       | 20          |
| 16    | 5-13       | 20          |
| 17    | 5-13, 12   | 20          |
| 18    | 14-17      | 20          |
| 19    | 14-17      | 20          |
| 20    | 14-19      | F1-F4       |
| F1-F4 | 20         | user okay   |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks → `quick` (all foundation/scaffolding)
- **Wave 2**: 3 tasks → `quick` (theme/CSS work)
- **Wave 3**: 6 tasks → `quick` (component migration)
- **Wave 4**: 4 tasks → `visual-engineering` + `quick` (page overhauls)
- **Wave 5**: 3 tasks → `unspecified-high` + `quick` (performance)
- **FINAL**: 4 tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

- [x] 1. **Commit State + Establish Performance Baseline**

  **What to do**:
  - Run `git status` to check current state
  - If uncommitted changes exist, stage and commit with message: `chore(web): baseline before UI overhaul`
  - Record pre-change metrics:
    - CSS file size: `wc -l apps/web/src/styles.css`
    - Bundle size: `bun --cwd apps/web run build` then `du -sh apps/web/dist/`
    - Count of heavy CSS effects: `grep -c "backdrop-filter\|feTurbulence\|filter: blur\|animation:" apps/web/src/styles.css`
    - Count of non-greyscale colors: `grep -E "oklch\(|hsl\(|#" apps/web/src/styles.css | grep -iv "gray\|grey\|white\|black\|slate\|zinc\|neutral\|stone" | wc -l`
  - Save baseline report to `.sisyphus/evidence/baseline-metrics.txt`

  **Must NOT do**:
  - Do NOT modify any source files
  - Do NOT run shadcn commands yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `apps/web/src/styles.css` - Current CSS to measure
  - `apps/web/package.json` - Current dependencies

  **Acceptance Criteria**:
  - [ ] Git commit exists with baseline files
  - [ ] `.sisyphus/evidence/baseline-metrics.txt` exists with all metrics recorded

  **QA Scenarios**:

  ```
  Scenario: Baseline metrics captured
    Tool: Bash
    Preconditions: Clean working tree or changes committed
    Steps:
      1. Run `git log -1 --oneline`
      2. Check `.sisyphus/evidence/baseline-metrics.txt` exists
    Expected Result: Commit message contains "baseline" and metrics file exists
    Evidence: .sisyphus/evidence/task-1-baseline.txt
  ```

  **Commit**: YES
  - Message: `chore(web): baseline before UI overhaul`
  - Files: All uncommitted changes

- [x] 2. **Initialize shadcn/ui with Preset `buFzFmS`**

  **What to do**:
  - Navigate to `apps/web/` directory
  - Run: `bunx --bun shadcn@latest init --preset buFzFmS --base base --yes`
    - This will create `components.json`, update `package.json`, install dependencies
  - Verify `components.json` was created with correct preset configuration
  - Verify shadcn/ui components directory was created (typically `src/components/ui/`)
  - Check that the lyra style components were generated
  - Document any manual merge conflicts with existing files

  **Must NOT do**:
  - Do NOT use `--only theme` flag (user wants full lyra style)
  - Do NOT modify the generated component files yet
  - Do NOT delete existing custom components yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1, but must wait for Task 1 git commit)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: Task 1

  **References**:
  - `apps/web/package.json` - Will be modified to add shadcn dependencies
  - `apps/web/vite.config.ts` - May need path alias updates for `@/` imports
  - AGENTS.md: "shadcn/ui" initialization conventions

  **Acceptance Criteria**:
  - [ ] `apps/web/components.json` exists and contains `preset: "buFzFmS"` or equivalent
  - [ ] `apps/web/src/components/ui/` contains shadcn-generated components (Button, Card, etc.)
  - [ ] `apps/web/package.json` has new shadcn-related dependencies
  - [ ] `bun install` completes successfully

  **QA Scenarios**:

  ```
  Scenario: shadcn initialized successfully
    Tool: Bash
    Preconditions: Task 1 complete, in apps/web directory
    Steps:
      1. Run `test -f components.json && echo "exists"`
      2. Run `ls src/components/ui/ | head -20`
      3. Run `grep -q "shadcn\|class-variance-authority" package.json && echo "deps ok"`
    Expected Result: components.json exists, ui/ directory has files, deps updated
    Evidence: .sisyphus/evidence/task-2-shadcn-init.txt
  ```

  **Commit**: YES
  - Message: `chore(web): initialize shadcn/ui with buFzFmS preset`
  - Files: `components.json`, `package.json`, `package-lock.json` or `bun.lockb`, new `src/components/ui/` files

- [x] 3. **Install hugeicons and jetbrains-mono Dependencies**

  **What to do**:
  - In `apps/web/`, run: `bun add @hugeicons/react`
  - Add JetBrains Mono font:
    - Option A: `bun add @fontsource/jetbrains-mono` and import in styles.css
    - Option B: Use Google Fonts CDN import in styles.css (simpler, recommended for Workers)
  - Update `apps/web/src/styles.css` to import the font:
    ```css
    @import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap");
    ```
  - Update `@theme inline` font-mono declaration to use JetBrains Mono
  - Verify `lucide-react` is removed from dependencies (or plan removal in Task 8-13)

  **Must NOT do**:
  - Do NOT remove lucide-react yet (needed during migration)
  - Do NOT update component imports yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 8-13 (component migration)
  - **Blocked By**: Task 2

  **References**:
  - `apps/web/package.json` - Add new dependencies
  - `apps/web/src/styles.css` - Add font import and update font-mono token
  - Current font import at line 1 of styles.css: `@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk...")`

  **Acceptance Criteria**:
  - [ ] `bun add @hugeicons/react` completes successfully
  - [ ] `package.json` contains `@hugeicons/react`
  - [ ] `styles.css` imports JetBrains Mono font
  - [ ] `@theme inline` has `--font-mono: "JetBrains Mono", ...`

  **QA Scenarios**:

  ```
  Scenario: Dependencies installed and font configured
    Tool: Bash
    Steps:
      1. Run `grep -q "@hugeicons/react" package.json && echo "hugeicons ok"`
      2. Run `grep -q "JetBrains" src/styles.css && echo "font ok"`
      3. Run `grep -q "font-mono.*JetBrains" src/styles.css && echo "theme ok"`
    Expected Result: All three checks pass
    Evidence: .sisyphus/evidence/task-3-deps.txt
  ```

  **Commit**: YES (groups with Task 2)

- [x] 4. **Configure shadcn Project Setup and Path Aliases**

  **What to do**:
  - Verify `components.json` has correct paths:
    - `tsx: true`
    - `style: "lyra"`
    - `baseColor: "neutral"`
    - `cssVariables: true`
    - `rsc: false` (not using Next.js RSC)
    - `tailwind.css` pointing to correct file
  - Update `apps/web/tsconfig.json` if needed to ensure `@/` path alias works for shadcn imports
  - Check `apps/web/vite.config.ts` for path resolution:
    - Current uses `resolve: { tsconfigPaths: true }` which should handle `@/` if configured in tsconfig
    - Ensure `src/components/ui` is accessible via `@/components/ui/`
  - Verify `cn()` utility in `apps/web/src/lib/utils.ts` is compatible with shadcn's expectations
    - Should use `clsx` + `tailwind-merge`
    - May need to update import path if shadcn generated a new one

  **Must NOT do**:
  - Do NOT change the existing `#/*` alias (used by current codebase)
  - Do NOT break existing imports

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 5-7 (theme tasks need working config)
  - **Blocked By**: Task 2

  **References**:
  - `apps/web/components.json` - Verify all fields
  - `apps/web/tsconfig.json` - Path aliases
  - `apps/web/vite.config.ts` - Resolve config
  - `apps/web/src/lib/utils.ts` - cn() utility

  **Acceptance Criteria**:
  - [ ] `components.json` has all required fields correctly set
  - [ ] TypeScript can resolve `@/components/ui/button` imports
  - [ ] `cn()` utility is present and functional
  - [ ] No TypeScript errors from path resolution

  **QA Scenarios**:

  ```
  Scenario: Path aliases work correctly
    Tool: Bash
    Steps:
      1. Run `bun run typecheck 2>&1 | head -20`
      2. Check no "Cannot find module" errors for @/components/ui paths
    Expected Result: Typecheck passes or only has pre-existing errors
    Evidence: .sisyphus/evidence/task-4-config.txt
  ```

  **Commit**: YES (groups with Task 2)

- [x] 5. **Override Preset Colors to Grey/White Only**

  **What to do**:
  - Open `apps/web/src/styles.css` (or the file specified in components.json as the CSS file)
  - Find all CSS custom properties (variables) that define colors:
    - `--background`, `--foreground`, `--card`, `--card-foreground`
    - `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`
    - `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`
    - `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`
    - `--border`, `--input`, `--ring`
    - Any chart colors: `--chart-1` through `--chart-5`
  - Replace ALL color values with grey/white only:
    - Use `oklch()` or `hsl()` with near-zero chroma for greys
    - Example: `--primary: oklch(0.98 0 0)` (white), `--background: oklch(0.15 0 0)` (near-black)
    - `--accent` should be a slightly lighter grey, not blue/cyan
    - `--destructive` can remain a muted red/grey (still needs to indicate errors)
    - `--chart-*` should use a greyscale gradient from white to dark grey
  - Remove ALL custom accent colors:
    - `--accent-blue: #3b82f6` → remove or change to grey
    - `--accent-cyan: #06b6d4` → remove or change to grey
  - Update `@theme inline` color mappings to use the new grey/white variables
  - Ensure no `linear-gradient` with blue/cyan remains
  - Run greyscale audit: `grep -E "oklch\(|hsl\(|#" src/styles.css | grep -iv "gray\|grey\|white\|black\|slate\|zinc\|neutral\|stone\|red" | wc -l` → should be 0

  **Must NOT do**:
  - Do NOT leave any blue (`#3b82f6`), cyan (`#06b6d4`), purple, or other vibrant colors
  - Do NOT change non-color CSS (spacing, radius, shadows) unless part of the preset
  - Do NOT break existing variable references in component files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 8-13, 14-17
  - **Blocked By**: Tasks 2, 4

  **References**:
  - `apps/web/src/styles.css` - Lines 8-131 contain all color variables
  - Current colors to replace: `--accent-blue: #3b82f6` (line 43), `--accent-cyan: #06b6d4` (line 44)
  - Current gradients: `.gradient-text` (lines 253-264), `.glow-border::before` (lines 272-288)

  **Acceptance Criteria**:
  - [ ] All CSS color variables use grey/white only
  - [ ] No blue, cyan, purple, or other vibrant accent colors remain
  - [ ] Greyscale audit passes (0 non-greyscale colors)
  - [ ] All existing component files still reference valid variables

  **QA Scenarios**:

  ```
  Scenario: Grey/white theme applied
    Tool: Bash
    Steps:
      1. Run `grep -E "oklch\(|hsl\(|#" apps/web/src/styles.css | grep -iv "gray\|grey\|white\|black\|slate\|zinc\|neutral\|stone\|red" | wc -l`
      2. Run `grep -c "accent-blue\|accent-cyan\|3b82f6\|06b6d4" apps/web/src/styles.css`
    Expected Result: First command returns 0, second returns 0
    Evidence: .sisyphus/evidence/task-5-colors.txt
  ```

  **Commit**: YES
  - Message: `style(web): override preset to grey/white only`
  - Files: `apps/web/src/styles.css`

- [x] 6. **Optimize CSS Effects (Remove Heavy, Keep Performant)**

  **What to do**:
  - Audit all CSS effects in `apps/web/src/styles.css`:
  - **REMOVE** (expensive GPU/compositing operations):
    - `backdrop-filter: blur(12px)` (lines 249-250) → Remove or replace with simple opacity
    - `feTurbulence` noise texture (lines 384-386) → Remove entirely
    - `filter: blur(80px)` on hero orbs (line 800) → Remove or reduce to 20px max
    - Heavy box-shadow glows: `box-shadow: 0 0 20px rgba(59, 130, 246, 0.4)` → Replace with subtle border or opacity change
    - `mask-image: radial-gradient` (lines 158, 878) → Remove or simplify
    - Complex layered backgrounds with multiple gradients → Simplify to 1-2 layers max
  - **OPTIMIZE** (keep but improve performance):
    - Hero animations (`hero-fade-up`, `hero-delay-*`): Keep but add `will-change: transform, opacity` and use `transform`/`opacity` only (GPU-accelerated properties)
    - `hero-orb-drift-*` animations: Reduce blur, simplify gradients, ensure `will-change: transform`
    - Grid line animations: Keep but ensure they use `transform` only
    - Hover transitions: Keep but ensure `transition` uses only `transform`, `opacity`, `color`
  - **ADD** performance optimizations:
    - Add `will-change: transform` to animated elements
    - Use `transform: translateZ(0)` to force GPU layer where needed
    - Ensure `@media (prefers-reduced-motion: reduce)` is respected for all animations
  - Keep the `.hero-animate` system but simplify
  - Keep responsive breakpoints intact
  - Target: Reduce styles.css from 915 lines to under 400 lines

  **Must NOT do**:
  - Do NOT remove all animations (user wants optimized existing effects)
  - Do NOT change responsive breakpoints
  - Do NOT remove CSS custom property definitions (spacing, radius, etc.)
  - Do NOT add NEW heavy effects

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 14-17, 20
  - **Blocked By**: Tasks 2, 4

  **References**:
  - `apps/web/src/styles.css` - Full file, especially:
    - Lines 139-145: Body background gradients
    - Lines 148-159: Body::before grid pattern with mask-image
    - Lines 246-251: `.depth-panel` with backdrop-filter
    - Lines 266-288: `.glow-border` with gradient mask
    - Lines 290-315: `.shimmer` animation
    - Lines 366-387: Hero noise texture with feTurbulence
    - Lines 790-858: Hero orbs with blur filters
    - Lines 860-888: Grid lines with mask-image

  **Acceptance Criteria**:
  - [ ] `styles.css` under 400 lines (from 915 baseline)
  - [ ] Zero `backdrop-filter` occurrences
  - [ ] Zero `feTurbulence` occurrences
  - [ ] Zero `mask-image` occurrences (or simplified)
  - [ ] All remaining animations use only `transform` and `opacity`
  - [ ] `prefers-reduced-motion` respected

  **QA Scenarios**:

  ```
  Scenario: CSS effects optimized
    Tool: Bash
    Steps:
      1. Run `wc -l apps/web/src/styles.css` → verify < 400
      2. Run `grep -c "backdrop-filter" apps/web/src/styles.css` → verify 0
      3. Run `grep -c "feTurbulence\|mask-image" apps/web/src/styles.css` → verify 0
      4. Run `grep -c "filter: blur" apps/web/src/styles.css` → verify 0
    Expected Result: All counts match targets
    Evidence: .sisyphus/evidence/task-6-css-optimize.txt
  ```

  **Commit**: YES
  - Message: `perf(web): remove heavy CSS effects, optimize animations`
  - Files: `apps/web/src/styles.css`

- [x] 7. **Update Global Styles and Tailwind Theme Tokens**

  **What to do**:
  - Review and update `@theme inline` block in `styles.css`:
    - Ensure all `--color-*` mappings point to the new grey/white variables
    - Update `--font-sans` to match the preset's font (if different from Space Grotesk)
    - Keep `--font-mono` as JetBrains Mono (from Task 3)
    - Verify `--radius-*` tokens match lyra style
  - Remove custom utility classes that duplicate Tailwind v4 utilities:
    - `.lp-section`, `.lp-container`, `.lp-grid*` → Replace with Tailwind classes in components
    - `.lp-card`, `.lp-title`, `.lp-subtitle`, `.lp-label` → Replace with Tailwind/shadcn utilities
    - `.depth-panel` → Can keep but simplify (removed backdrop-filter already)
    - `.gradient-text` → Change to solid grey/white or remove
    - `.glow-border` → Remove (relies on gradient masks)
    - `.shimmer` → Simplify or remove
    - `.hero-*` classes → Keep but ensure they reference updated variables
    - `.how-it-works__*`, `.community-stats__*`, `.faq__*` → These are component-specific, can stay but will be moved to component files in Wave 4
  - Ensure `:root` dark mode variables are correct for grey/white theme
  - Clean up any unused CSS variables
  - Verify the `@import "tailwindcss"` and `@plugin` directives are still correct

  **Must NOT do**:
  - Do NOT break existing Tailwind v4 configuration
  - Do NOT remove `@import "tailwindcss"` or `@import "tw-animate-css"`
  - Do NOT change the `@custom-variant dark` setup

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 14-17
  - **Blocked By**: Tasks 2, 4

  **References**:
  - `apps/web/src/styles.css` - `@theme inline` block (lines 88-131)
  - `apps/web/src/styles.css` - Custom utility classes (lines 177-915)
  - Tailwind CSS v4 docs for `@theme inline` syntax

  **Acceptance Criteria**:
  - [ ] `@theme inline` correctly maps all colors to grey/white variables
  - [ ] No custom utility classes that duplicate Tailwind utilities remain
  - [ ] All remaining custom classes reference valid variables
  - [ ] `bun run typecheck` still passes

  **QA Scenarios**:

  ```
  Scenario: Theme tokens updated
    Tool: Bash
    Steps:
      1. Run `grep "@theme inline" apps/web/src/styles.css -A 50 | grep -c "color-"`
      2. Run `grep -c "lp-section\|lp-container\|lp-grid" apps/web/src/styles.css`
      3. Run `bun --cwd apps/web run typecheck 2>&1 | grep -c "error TS"`
    Expected Result: Theme has color mappings, utility classes reduced, typecheck passes
    Evidence: .sisyphus/evidence/task-7-tokens.txt
  ```

  **Commit**: YES (groups with Tasks 5-6)

- [x] 8. **Replace Button with shadcn Button + Update All Imports**

  **What to do**:
  - The shadcn `init` command (Task 2) should have generated a new `button.tsx` in `src/components/ui/`
  - Compare the generated shadcn Button with the old custom Button:
    - Old custom variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `depth`, `gradient`
    - New shadcn variants: likely `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
  - If the old `depth` and `gradient` variants are still needed by pages:
    - Extend the shadcn Button's CVA config to add them back
    - BUT restyle them with grey/white instead of blue/cyan
    - `depth`: Dark grey background with subtle border (no glow)
    - `gradient`: Remove entirely or replace with a simple grey variant
  - Find ALL usages of the old Button using `lsp_find_references` on the old Button export:
    - `apps/web/src/routes/leaderboard.tsx` (lines 12, 221-228, 403-422)
    - `apps/web/src/components/navbar.tsx`
    - `apps/web/src/components/hero.tsx`
    - `apps/web/src/components/how-it-works.tsx`
    - Any other files importing `Button` from `#/components/ui/button`
  - Update ALL imports from `#/components/ui/button` to `@/components/ui/button`
  - Verify the shadcn Button uses hugeicons (if it has icon-related classes)
  - Test that all Button usages still render correctly

  **Must NOT do**:
  - Do NOT keep the old button.tsx file (shadcn init should have overwritten it)
  - Do NOT add new variants beyond what's needed for existing pages
  - Do NOT change Button API/signature (keep `variant`, `size`, `asChild` props)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10, 11, 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 14-17
  - **Blocked By**: Tasks 3, 5

  **References**:
  - `apps/web/src/components/ui/button.tsx` - New shadcn Button (post-init)
  - `apps/web/src/routes/leaderboard.tsx` - Heavy Button usage
  - `apps/web/src/components/navbar.tsx` - Button usage
  - `apps/web/src/components/hero.tsx` - Button usage (CTA buttons)

  **Acceptance Criteria**:
  - [ ] All files import Button from `@/components/ui/button`
  - [ ] No files import from old `#/components/ui/button` path
  - [ ] All existing Button usages compile without errors
  - [ ] Custom variants (`depth`, `gradient`) either removed or restyled grey/white

  **QA Scenarios**:

  ```
  Scenario: Button migration complete
    Tool: Bash + grep
    Steps:
      1. Run `grep -r "from.*#/components/ui/button" apps/web/src/ | wc -l` → 0
      2. Run `grep -r "from.*@/components/ui/button" apps/web/src/ | wc -l` → >0
      3. Run `bun --cwd apps/web run typecheck 2>&1 | grep -i "button" | wc -l` → 0
    Expected Result: Old imports gone, new imports present, no Button type errors
    Evidence: .sisyphus/evidence/task-8-button.txt
  ```

  **Commit**: YES
  - Message: `refactor(web): migrate Button to shadcn/ui`
  - Files: `apps/web/src/components/ui/button.tsx`, all files with updated imports

- [x] 9. **Replace Card with shadcn Card + Update All Imports**

  **What to do**:
  - The shadcn `init` command should have generated a new `card.tsx`
  - Compare old custom Card with new shadcn Card:
    - Old: `default` and `depth` variants, subcomponents (Header, Footer, Title, Description, Action, Content)
    - New: shadcn Card with similar subcomponents but lyra-styled
  - If old `depth` variant is needed:
    - Add it to the shadcn Card as an extended variant
    - Restyle with grey/white (dark grey bg, subtle border)
  - Find ALL usages using `lsp_find_references`:
    - `apps/web/src/components/hero.tsx`
    - `apps/web/src/components/community-stats.tsx`
    - `apps/web/src/components/features.tsx`
    - `apps/web/src/components/how-it-works.tsx`
    - `apps/web/src/components/faq.tsx`
    - `apps/web/src/routes/dashboard/$guildId/index.tsx`
    - Any other files
  - Update ALL imports from `#/components/ui/card` to `@/components/ui/card`
  - Verify subcomponent names match (CardHeader, CardContent, etc.)

  **Must NOT do**:
  - Do NOT break Card subcomponent API (keep CardHeader, CardContent, etc.)
  - Do NOT add new Card variants beyond existing needs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 10, 11, 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 14-17
  - **Blocked By**: Tasks 3, 5

  **References**:
  - `apps/web/src/components/ui/card.tsx` - New shadcn Card
  - `apps/web/src/components/hero.tsx` - Card usage in stat cards
  - `apps/web/src/components/community-stats.tsx` - Card usage

  **Acceptance Criteria**:
  - [ ] All files import Card from `@/components/ui/card`
  - [ ] All Card subcomponents (Header, Content, Footer, etc.) work
  - [ ] `depth` variant either removed or restyled grey/white
  - [ ] No type errors from Card usage

  **QA Scenarios**:

  ```
  Scenario: Card migration complete
    Tool: Bash + grep
    Steps:
      1. Run `grep -r "from.*#/components/ui/card" apps/web/src/ | wc -l` → 0
      2. Run `grep -r "from.*@/components/ui/card" apps/web/src/ | wc -l` → >0
      3. Run `bun --cwd apps/web run typecheck 2>&1 | grep -i "card" | wc -l` → 0
    Expected Result: Old imports gone, new imports present, no Card type errors
    Evidence: .sisyphus/evidence/task-9-card.txt
  ```

  **Commit**: YES
  - Message: `refactor(web): migrate Card to shadcn/ui`

- [x] 10. **Replace Badge with shadcn Badge + Update All Imports**

  **What to do**:
  - The shadcn `init` command should have generated a new `badge.tsx`
  - Compare old custom Badge with new shadcn Badge:
    - Old variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`, `gradient-blue`, `gradient-cyan`, `gradient-mixed`
    - New variants: likely `default`, `secondary`, `destructive`, `outline`
  - Remove or restyle custom gradient variants:
    - `gradient-blue`, `gradient-cyan`, `gradient-mixed` → Replace with `default` or `secondary`
    - Remove glow shadows from Badge styling
  - Find ALL usages using `lsp_find_references`:
    - `apps/web/src/routes/leaderboard.tsx` (heavy usage for platform badges)
    - `apps/web/src/components/leaderboard-preview.tsx`
    - Any other files
  - Update ALL imports from `#/components/ui/badge` to `@/components/ui/badge`
  - In leaderboard.tsx, platform badges currently use color-coded classes:
    - `pc: "bg-blue-500/20 text-blue-400"` → Change to grey/white: `pc: "bg-gray-500/20 text-gray-400"`
    - `xbox: "bg-green-500/20 text-green-400"` → `xbox: "bg-gray-500/20 text-gray-400"`
    - `playstation: "bg-purple-500/20 text-purple-400"` → `playstation: "bg-gray-500/20 text-gray-400"`
    - Or keep subtle platform differentiation with very muted greys

  **Must NOT do**:
  - Do NOT keep blue/cyan/purple glow shadows on badges
  - Do NOT add new Badge variants

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9, 11, 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 14-17
  - **Blocked By**: Tasks 3, 5

  **References**:
  - `apps/web/src/components/ui/badge.tsx` - New shadcn Badge
    - `apps/web/src/routes/leaderboard.tsx` - Lines 57-67 and 287-293 (badge usage)
    - `apps/web/src/routes/leaderboard.tsx` - Lines 340-345 (mobile badge usage)

  **Acceptance Criteria**:
  - [ ] All files import Badge from `@/components/ui/badge`
  - [ ] No gradient/glow variants remain
  - [ ] Platform badges in leaderboard use grey/white only
  - [ ] No type errors from Badge usage

  **QA Scenarios**:

  ```
  Scenario: Badge migration complete
    Tool: Bash + grep
    Steps:
      1. Run `grep -r "from.*#/components/ui/badge" apps/web/src/ | wc -l` → 0
      2. Run `grep -r "gradient-blue\|gradient-cyan\|gradient-mixed" apps/web/src/ | wc -l` → 0
      3. Run `grep -c "blue-400\|green-400\|purple-400" apps/web/src/routes/leaderboard.tsx` → 0
    Expected Result: Old imports gone, gradient variants gone, no vibrant colors in badges
    Evidence: .sisyphus/evidence/task-10-badge.txt
  ```

  **Commit**: YES
  - Message: `refactor(web): migrate Badge to shadcn/ui`

- [x] 11. **Replace Separator with shadcn Separator + Update All Imports**

  **What to do**:
  - The shadcn `init` command should have generated a new `separator.tsx`
  - Compare old custom Separator with new shadcn Separator
  - Find ALL usages using `lsp_find_references`
  - Update ALL imports from `#/components/ui/separator` to `@/components/ui/separator`
  - This component likely has fewer usages than Button/Card/Badge

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9, 10, 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 14-17
  - **Blocked By**: Tasks 3, 5

  **References**:
  - `apps/web/src/components/ui/separator.tsx` - New shadcn Separator

  **Acceptance Criteria**:
  - [ ] All files import Separator from `@/components/ui/separator`
  - [ ] No type errors from Separator usage

  **QA Scenarios**:

  ```
  Scenario: Separator migration complete
    Tool: Bash + grep
    Steps:
      1. Run `grep -r "from.*#/components/ui/separator" apps/web/src/ | wc -l` → 0
      2. Run `grep -r "from.*@/components/ui/separator" apps/web/src/ | wc -l` → >0
    Expected Result: Imports updated
    Evidence: .sisyphus/evidence/task-11-separator.txt
  ```

  **Commit**: YES (groups with Tasks 8-10)

- [x] 12. **Install Additional shadcn Components (Avatar, Skeleton, DropdownMenu)**

  **What to do**:
  - Install shadcn components needed for auth UI and enhanced UX:
    ```bash
    cd apps/web
    bunx --bun shadcn@latest add avatar skeleton dropdown-menu
    ```
  - These components are needed for:
    - **Avatar**: Display Discord user avatar in navbar and dashboard
    - **Skeleton**: Loading states for leaderboard, dashboard data
    - **DropdownMenu**: User menu in navbar (profile, logout)
  - Verify each component was installed correctly in `src/components/ui/`
  - Ensure they follow the grey/white theme (should inherit from CSS variables automatically)
  - Check that `dropdown-menu.tsx` doesn't introduce heavy dependencies

  **Must NOT do**:
  - Do NOT install more than these 3 additional components
  - Do NOT install components "just in case"

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9, 10, 11, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 16-17 (login flow needs these)
  - **Blocked By**: Tasks 3, 5

  **References**:
  - shadcn/ui docs for Avatar, Skeleton, DropdownMenu
  - `apps/web/src/components/navbar.tsx` - Will use Avatar and DropdownMenu
  - `apps/web/src/routes/dashboard/index.tsx` - Will use Avatar
  - `apps/web/src/routes/leaderboard.tsx` - Will use Skeleton for loading states

  **Acceptance Criteria**:
  - [ ] `avatar.tsx`, `skeleton.tsx`, `dropdown-menu.tsx` exist in `src/components/ui/`
  - [ ] All three components compile without errors
  - [ ] No additional unexpected components installed

  **QA Scenarios**:

  ```
  Scenario: Additional components installed
    Tool: Bash
    Steps:
      1. Run `ls apps/web/src/components/ui/ | grep -E "avatar|skeleton|dropdown-menu"`
      2. Run `bun --cwd apps/web run typecheck 2>&1 | grep -E "avatar|skeleton|dropdown-menu" | wc -l`
    Expected Result: All three files exist, no type errors
    Evidence: .sisyphus/evidence/task-12-components.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add shadcn Avatar, Skeleton, DropdownMenu`

- [x] 13. **Replace FloatingStatCard with Optimized Version**

  **What to do**:
  - The `floating-stat-card.tsx` is a custom component with no direct shadcn equivalent
  - It likely has 3D tilt effects and floating animations
  - Options:
    1. **Replace with standard shadcn Card**: Use Card + CardContent with stat data
    2. **Keep but optimize**: Remove 3D transforms, replace with simple hover lift (translateY)
    3. **Create custom component**: Build a new lightweight stat card using shadcn Card as base
  - Recommended: Option 3 — create a new `stat-card.tsx` that:
    - Uses shadcn Card as the base
    - Has simple hover effect: `hover:translate-y-[-2px] transition-transform`
    - No 3D transforms, no backdrop-filter, no heavy shadows
    - Grey/white styling only
  - Find all usages of FloatingStatCard:
    - `apps/web/src/components/hero.tsx` (most likely)
    - Any other files
  - Replace usages with new component
  - Delete old `floating-stat-card.tsx`

  **Must NOT do**:
  - Do NOT keep 3D transforms or heavy tilt effects
  - Do NOT add new heavy animations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9, 10, 11, 12)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 14 (landing page uses stat cards)
  - **Blocked By**: Tasks 3, 5

  **References**:
  - `apps/web/src/components/ui/floating-stat-card.tsx` - Old component
  - `apps/web/src/components/hero.tsx` - Usage of stat cards
  - `apps/web/src/components/ui/card.tsx` - New shadcn Card to use as base

  **Acceptance Criteria**:
  - [ ] Old `floating-stat-card.tsx` deleted
  - [ ] New lightweight stat card component created
  - [ ] All usages updated
  - [ ] No 3D transforms or heavy effects

  **QA Scenarios**:

  ```
  Scenario: FloatingStatCard replaced
    Tool: Bash + grep
    Steps:
      1. Run `test -f apps/web/src/components/ui/floating-stat-card.tsx && echo "exists" || echo "deleted"` → "deleted"
      2. Run `grep -r "FloatingStatCard" apps/web/src/ | wc -l` → 0
      3. Run `grep -r "StatCard\|stat-card" apps/web/src/ | wc -l` → >0
    Expected Result: Old component gone, new component used
    Evidence: .sisyphus/evidence/task-13-statcard.txt
  ```

  **Commit**: YES
  - Message: `refactor(web): replace FloatingStatCard with optimized version`

- [x] 14. **Overhaul Landing Page (/) with New Theme**

  **What to do**:
  - Update `apps/web/src/routes/index.tsx`:
    - Ensure all component imports use `@/components/ui/` paths
    - Remove any hardcoded color classes (blue, cyan, purple)
  - Update `apps/web/src/components/hero.tsx`:
    - Replace `lucide-react` icons with `hugeicons` equivalents
    - Remove or restyle gradient text (`.gradient-text`)
    - Remove or restyle glow borders (`.glow-border`)
    - Update stat cards to use new lightweight StatCard component
    - Ensure hero animations use optimized CSS classes
    - Change CTA buttons to use grey/white styling
  - Update `apps/web/src/components/how-it-works.tsx`:
    - Replace gradient badge backgrounds with grey/white
    - Update connector lines to grey instead of blue/cyan gradient
  - Update `apps/web/src/components/community-stats.tsx`:
    - Replace gradient text on numbers with solid grey/white
    - Update card styling to use shadcn Card
  - Update `apps/web/src/components/features.tsx`:
    - Remove any blue/cyan accents
    - Use grey/white color scheme
  - Update `apps/web/src/components/discord-mock.tsx`:
    - Ensure Discord mock uses grey/white theme
  - Update `apps/web/src/components/command-reference.tsx`:
    - Update styling to match new theme
  - Update `apps/web/src/components/faq.tsx`:
    - Update accordion styling to use grey/white
    - Remove blue focus rings, use grey/white
  - Update `apps/web/src/components/footer.tsx`:
    - Update styling to match new theme
  - Ensure all sections use consistent spacing and typography

  **Must NOT do**:
  - Do NOT change marketing copy or text content
  - Do NOT add new sections
  - Do NOT remove existing sections

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 15, 16, 17)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 5-13

  **References**:
  - `apps/web/src/routes/index.tsx` - Landing page route
  - `apps/web/src/components/hero.tsx` - Hero section
  - `apps/web/src/components/how-it-works.tsx` - Steps section
  - `apps/web/src/components/community-stats.tsx` - Stats section
  - `apps/web/src/components/features.tsx` - Features section
  - `apps/web/src/components/faq.tsx` - FAQ section
  - `apps/web/src/components/footer.tsx` - Footer
  - `apps/web/src/styles.css` - Updated theme variables

  **Acceptance Criteria**:
  - [ ] Landing page renders without errors
  - [ ] No blue, cyan, or purple colors visible
  - [ ] All icons are from hugeicons (not lucide-react)
  - [ ] Hero animations are smooth and performant
  - [ ] Mobile responsive works correctly

  **QA Scenarios**:

  ```
  Scenario: Landing page renders with new theme
    Tool: Playwright
    Preconditions: dev server running (`bun --cwd apps/web run dev`)
    Steps:
      1. Navigate to http://localhost:3001/
      2. Take full-page screenshot
      3. Check no blue/cyan elements visible
      4. Verify hero section has animations
    Expected Result: Page loads, grey/white theme, no vibrant colors, animations work
    Evidence: .sisyphus/evidence/task-14-landing.png

  Scenario: Landing page mobile responsive
    Tool: Playwright
    Steps:
      1. Set viewport to 375x667 (iPhone SE)
      2. Navigate to http://localhost:3001/
      3. Take screenshot
      4. Verify no horizontal overflow
    Expected Result: Page fits mobile viewport, no overflow
    Evidence: .sisyphus/evidence/task-14-landing-mobile.png
  ```

  **Commit**: YES
  - Message: `feat(web): overhaul landing page with grey/white theme`

- [x] 15. **Overhaul Leaderboard Page**

  **What to do**:
  - Update `apps/web/src/routes/leaderboard.tsx`:
    - Replace `lucide-react` icons with `hugeicons` equivalents:
      - `Search` → hugeicons equivalent
      - `ChevronLeft`, `ChevronRight` → hugeicons equivalents
      - `TrendingUp`, `TrendingDown`, `Minus` → hugeicons equivalents
      - `Activity` → hugeicons equivalent
    - Update all Button imports to use `@/components/ui/button`
    - Update all Badge imports to use `@/components/ui/badge`
    - Change gradient text heading to solid grey/white
    - Update platform badge colors to grey/white only:
      - Remove `bg-blue-500/20 text-blue-400`, `bg-green-500/20 text-green-400`, `bg-purple-500/20 text-purple-400`
      - Use subtle grey variations or simple text labels
    - Remove glow shadows from table rows: `hover:shadow-[0_0_20px_rgba(59,130,246,0.1)]`
    - Replace with subtle hover: `hover:bg-white/5`
    - Remove glow from mobile cards: `hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]`
    - Update search input styling to use shadcn styling conventions
    - Add Skeleton loading states for table rows while data loads
    - Update pagination buttons to use shadcn Button
    - Ensure table headers use grey/white muted text
    - Keep all data fetching and WebSocket logic intact

  **Must NOT do**:
  - Do NOT change data fetching logic
  - Do NOT change WebSocket hook usage
  - Do NOT change pagination logic
  - Do NOT remove platform filter functionality

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 16, 17)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 5-13

  **References**:
  - `apps/web/src/routes/leaderboard.tsx` - Full file (429 lines)
  - `apps/web/src/hooks/use-leaderboard-ws.ts` - WebSocket hook (do NOT modify)
  - `apps/web/src/components/ui/skeleton.tsx` - New shadcn Skeleton
  - `apps/web/src/components/ui/button.tsx` - New shadcn Button
  - `apps/web/src/components/ui/badge.tsx` - New shadcn Badge

  **Acceptance Criteria**:
  - [ ] All icons from hugeicons
  - [ ] No vibrant colors in badges or table
  - [ ] Loading states use Skeleton component
  - [ ] Table and mobile cards render correctly
  - [ ] Pagination works
  - [ ] Search and filter functionality preserved

  **QA Scenarios**:

  ```
  Scenario: Leaderboard renders with new theme
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. Navigate to http://localhost:3001/leaderboard
      2. Wait for data to load (or verify Skeleton shows)
      3. Take screenshot
      4. Verify no blue/cyan/purple colors
      5. Verify pagination buttons work
    Expected Result: Page loads, grey/white theme, data displays, pagination works
    Evidence: .sisyphus/evidence/task-15-leaderboard.png

  Scenario: Leaderboard search and filter
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:3001/leaderboard
      2. Click platform filter button (e.g., "PC")
      3. Type in search box: "test"
      4. Verify filtered results show
    Expected Result: Filters and search work correctly
    Evidence: .sisyphus/evidence/task-15-leaderboard-filter.png
  ```

  **Commit**: YES
  - Message: `feat(web): overhaul leaderboard with grey/white theme`

- [x] 16. **Overhaul Dashboard with Discord Login Flow**

  **What to do**:
  - Update `apps/web/src/routes/dashboard/index.tsx`:
    - Add auth state checking using `authClient` from `#/lib/auth`
    - If user is NOT authenticated:
      - Show a clean, centered login card
      - Display official Discord "Log in with Discord" button:
        - Use shadcn Button with Discord brand colors (grey/white version per user request)
        - Include Discord icon from hugeicons
        - Button text: "Log in with Discord"
        - On click: call `authClient.signIn.social({ provider: "discord", callbackURL: "/dashboard" })`
      - Show brief description of what logging in enables
    - If user IS authenticated:
      - Show user avatar (using shadcn Avatar) and username
      - Show "Log out" option
      - Display guild list (existing functionality)
      - Each guild card uses shadcn Card
  - Update `apps/web/src/routes/dashboard/$guildId/index.tsx`:
    - Update styling to match new theme
    - Use shadcn components (Card, Badge, Button)
    - Ensure auth check still works
  - Update `apps/web/src/routes/dashboard/$guildId/history.tsx`:
    - Update styling to match new theme
    - Use shadcn components
  - Handle OAuth callback:
    - better-auth handles the callback automatically
    - The `callbackURL: "/dashboard"` in signIn ensures redirect back
    - No additional callback route needed

  **Must NOT do**:
  - Do NOT modify backend auth logic
  - Do NOT create new API routes
  - Do NOT change guild data fetching logic
  - Do NOT add profile management or settings

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 15, 17)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 5-13, 12

  **References**:
  - `apps/web/src/routes/dashboard/index.tsx` - Dashboard home
  - `apps/web/src/routes/dashboard/$guildId/index.tsx` - Guild dashboard
  - `apps/web/src/routes/dashboard/$guildId/history.tsx` - Match history
  - `apps/web/src/lib/auth.ts` - Auth client
  - `apps/web/src/components/ui/avatar.tsx` - shadcn Avatar
  - `apps/web/src/components/ui/card.tsx` - shadcn Card
  - `apps/web/src/components/ui/button.tsx` - shadcn Button
  - `packages/auth/src/index.ts` - Backend auth config (READ-ONLY reference)

  **Acceptance Criteria**:
  - [ ] Unauthenticated users see Discord login button
    - [ ] Login button uses hugeicons Discord icon
    - [ ] Clicking initiates Discord OAuth
    - [ ] After OAuth, redirects back to `/dashboard`
  - [ ] Authenticated users see their avatar and username
  - [ ] Guild list displays with shadcn Card styling
  - [ ] Logout functionality works
  - [ ] All dashboard pages use grey/white theme

  **QA Scenarios**:

  ```
  Scenario: Dashboard shows login for unauthenticated users
    Tool: Playwright
    Preconditions: dev server running, clear cookies/localStorage
    Steps:
      1. Navigate to http://localhost:3001/dashboard
      2. Verify "Log in with Discord" button is visible
      3. Screenshot the login card
      4. Verify button has Discord icon
    Expected Result: Login button visible, styled correctly, Discord icon present
    Evidence: .sisyphus/evidence/task-16-dashboard-login.png

  Scenario: Discord OAuth flow initiates
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:3001/dashboard
      2. Click "Log in with Discord" button
      3. Verify URL redirects to Discord OAuth (discord.com/oauth2/authorize)
    Expected Result: Redirects to Discord OAuth page
    Evidence: .sisyphus/evidence/task-16-oauth-redirect.png
  ```

  **Commit**: YES
  - Message: `feat(web): add Discord login to dashboard`

- [x] 17. **Update Navbar with Auth State and User Menu**

  **What to do**:
  - Update `apps/web/src/components/navbar.tsx`:
    - Replace `lucide-react` icons with `hugeicons` equivalents
    - Update Button imports to `@/components/ui/button`
    - Add auth state checking:
      - Use `authClient.useSession()` or `authClient.getSession()` to check auth
      - If authenticated:
        - Show user avatar (shadcn Avatar) with username
        - Use DropdownMenu for user menu with options:
          - "Dashboard" → navigate to `/dashboard`
          - "Log out" → call `authClient.signOut()` then reload
      - If not authenticated:
        - Show "Log in" button that navigates to `/dashboard`
    - Update nav links styling to match grey/white theme
    - Update mobile menu to use same auth state
    - Ensure navbar uses optimized CSS (no heavy effects)
  - Update `apps/web/src/components/page-frame.tsx`:
    - This appears to be a decorative frame overlay
    - Either remove it (if purely decorative/heavy) or simplify it significantly
    - If kept, ensure it uses grey/white only and no heavy effects

  **Must NOT do**:
  - Do NOT add new navigation links
  - Do NOT change the routing structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 15, 16)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 5-13, 12

  **References**:
  - `apps/web/src/components/navbar.tsx` - Navbar component
  - `apps/web/src/components/page-frame.tsx` - Frame overlay
  - `apps/web/src/lib/auth.ts` - Auth client
  - `apps/web/src/components/ui/avatar.tsx` - shadcn Avatar
  - `apps/web/src/components/ui/dropdown-menu.tsx` - shadcn DropdownMenu
  - `apps/web/src/components/ui/button.tsx` - shadcn Button

  **Acceptance Criteria**:
  - [ ] Navbar renders on all pages
  - [ ] Authenticated users see avatar + dropdown menu
  - [ ] Unauthenticated users see "Log in" link/button
  - [ ] Mobile menu works with auth state
  - [ ] All icons from hugeicons
  - [ ] Grey/white styling

  **QA Scenarios**:

  ```
  Scenario: Navbar shows auth state
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. Navigate to http://localhost:3001/
      2. Screenshot navbar
      3. Verify "Log in" button/link visible (when unauthenticated)
      4. Verify no lucide-react icons (check via devtools or screenshot)
    Expected Result: Navbar renders, auth state reflected, hugeicons used
    Evidence: .sisyphus/evidence/task-17-navbar.png
  ```

  **Commit**: YES
  - Message: `feat(web): update navbar with auth state and hugeicons`

- [x] 18. **Implement Route-Based Code Splitting (Lazy Loading)**

  **What to do**:
  - Convert heavy routes to use TanStack Router's lazy loading:
    - `apps/web/src/routes/leaderboard.tsx` → `apps/web/src/routes/leaderboard.lazy.tsx`
    - `apps/web/src/routes/dashboard/index.tsx` → `apps/web/src/routes/dashboard/index.lazy.tsx`
    - `apps/web/src/routes/dashboard/$guildId/index.tsx` → `apps/web/src/routes/dashboard/$guildId/index.lazy.tsx`
    - `apps/web/src/routes/dashboard/$guildId/history.tsx` → `apps/web/src/routes/dashboard/$guildId/history.lazy.tsx`
  - Keep `apps/web/src/routes/index.tsx` (landing page) as eager (it's the first page users see)
  - For each lazy route:
    - Rename file from `.tsx` to `.lazy.tsx`
    - Change `createFileRoute` to `createLazyFileRoute`:
      ```tsx
      import { createLazyFileRoute } from "@tanstack/react-router";
      export const Route = createLazyFileRoute("/leaderboard")({
        component: LeaderboardRoute,
      });
      ```
    - Keep the component function in the same file
  - Add Suspense fallbacks:
    - Create a simple loading component using shadcn Skeleton:
      ```tsx
      // apps/web/src/components/loading-fallback.tsx
      export function LoadingFallback() {
        return (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        );
      }
      ```
    - TanStack Router automatically wraps lazy routes with Suspense
    - Configure default `defaultPendingComponent` in router if needed
  - Update `apps/web/src/router.tsx`:
    - Ensure lazy routes are automatically picked up by TanStack Start
    - May need to regenerate route tree: `bunx --bun tsr generate` or it happens automatically on dev/build
  - Verify lazy loading works:
    - Build the project
    - Check that separate JS chunks are generated for lazy routes
    - Check chunk names in dist output

  **Must NOT do**:
  - Do NOT use raw `React.lazy` + `Suspense` (use TanStack's `createLazyFileRoute`)
  - Do NOT lazy load the landing page (`/`)
  - Do NOT lazy load the root layout (`__root.tsx`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19, 20)
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: Tasks 14-17

  **References**:
  - `apps/web/src/router.tsx` - Router config
  - `apps/web/src/routes/leaderboard.tsx` - Route to convert
  - `apps/web/src/routes/dashboard/index.tsx` - Route to convert
  - `apps/web/src/routes/dashboard/$guildId/index.tsx` - Route to convert
  - `apps/web/src/routes/dashboard/$guildId/history.tsx` - Route to convert
  - TanStack Router docs for `createLazyFileRoute`
  - `apps/web/src/components/ui/skeleton.tsx` - For loading fallback

  **Acceptance Criteria**:
  - [ ] `.lazy.tsx` files created for leaderboard, dashboard, guild dashboard, history
  - [ ] Original `.tsx` route files removed or converted
  - [ ] `createLazyFileRoute` used (not `React.lazy`)
  - [ ] Loading fallback component created with Skeleton
  - [ ] Build generates separate JS chunks for lazy routes
  - [ ] No TypeScript errors
  - [ ] Routes still navigate correctly in dev

  **QA Scenarios**:

  ```
  Scenario: Lazy routes generate separate chunks
    Tool: Bash
    Preconditions: Build completed
    Steps:
      1. Run `ls apps/web/dist/assets/*.js 2>/dev/null | wc -l`
      2. Verify multiple JS files exist (not just one bundle)
      3. Run `ls apps/web/dist/assets/*.js | grep -c "leaderboard\|dashboard"`
    Expected Result: Multiple chunks, including route-specific ones
    Evidence: .sisyphus/evidence/task-18-lazy-chunks.txt

  Scenario: Lazy loading works in dev
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. Navigate to http://localhost:3001/
      2. Click "Leaderboard" nav link
      3. Verify page loads (may show Skeleton briefly)
      4. Navigate to http://localhost:3001/dashboard
      5. Verify page loads
    Expected Result: Navigation works, lazy routes load correctly
    Evidence: .sisyphus/evidence/task-18-lazy-nav.png
  ```

  **Commit**: YES
  - Message: `perf(web): implement route-based code splitting`

- [x] 19. **Bundle Optimization and Asset Cleanup**

  **What to do**:
  - Optimize Vite build configuration:
    - Review `apps/web/vite.config.ts` for optimization opportunities:
      - Add `build.rollupOptions.output.manualChunks` to split vendor chunks:
        ```ts
        build: {
          rollupOptions: {
            output: {
              manualChunks: {
                react: ["react", "react-dom"],
                radix: ["radix-ui"],
                tanstack: ["@tanstack/react-router", "@tanstack/react-start"],
              },
            },
          },
        }
        ```
    - Consider adding `build.cssMinify: true` (Vite does this by default in production)
    - Ensure `build.target` is appropriate for Cloudflare Workers
  - Remove unused dependencies:
    - After migration is complete, check if `lucide-react` can be removed:
      - `grep -r "lucide-react" apps/web/src/` → should return 0 results
      - If 0, remove: `bun remove lucide-react`
    - Check for other unused dependencies
  - Optimize images and assets:
    - Check `apps/web/public/` for large images
    - Ensure favicons and icons are optimized
  - Tree-shaking verification:
    - Ensure `package.json` has `"sideEffects": false` if appropriate
    - Verify Vite's tree-shaking is working
  - Build and compare bundle size:
    - Record post-optimization bundle size
    - Compare with baseline from Task 1
    - Target: 20% reduction in total JS bundle size

  **Must NOT do**:
  - Do NOT break the build
  - Do NOT remove dependencies still used by other packages
  - Do NOT change framework versions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 18, 20)
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: Tasks 14-17

  **References**:
  - `apps/web/vite.config.ts` - Build config
  - `apps/web/package.json` - Dependencies
  - `.sisyphus/evidence/baseline-metrics.txt` - Baseline from Task 1
  - Vite docs for `build.rollupOptions`

  **Acceptance Criteria**:
  - [ ] Vendor chunks split in Vite config
  - [ ] `lucide-react` removed if no usages remain
  - [ ] Build succeeds
    - [ ] Bundle size reduced by >= 20% from baseline
    - [ ] No build warnings about large chunks
  - [ ] No unused dependencies

  **QA Scenarios**:

  ```
  Scenario: Bundle size reduced
    Tool: Bash
    Preconditions: Build completed
    Steps:
      1. Run `du -sh apps/web/dist/`
      2. Compare with baseline from `.sisyphus/evidence/baseline-metrics.txt`
      3. Calculate percentage reduction
    Expected Result: Total size reduced by >= 20%
    Evidence: .sisyphus/evidence/task-19-bundle-size.txt

  Scenario: No lucide-react remnants
    Tool: Bash
    Steps:
      1. Run `grep -r "lucide-react" apps/web/src/ | wc -l`
      2. Run `grep -q "lucide-react" apps/web/package.json && echo "present" || echo "removed"`
    Expected Result: 0 source references, package removed (or marked for removal)
    Evidence: .sisyphus/evidence/task-19-deps.txt
  ```

  **Commit**: YES
  - Message: `perf(web): optimize bundle with code splitting and dependency cleanup`

- [x] 20. **Final CSS Cleanup and Verification**

  **What to do**:
  - Final audit of `apps/web/src/styles.css`:
    - Run comprehensive grep for any remaining heavy effects:
      - `backdrop-filter` → 0
      - `feTurbulence` → 0
      - `filter: blur` → 0
      - `mask-image` → 0 or simplified
      - Complex layered gradients → simplified
    - Run color audit for non-greyscale values:
      - `grep -E "oklch\(|hsl\(|#" styles.css | grep -iv "gray\|grey\|white\|black\|slate\|zinc\|neutral\|stone\|red"` → 0
    - Verify CSS file size is under 400 lines
  - Check for unused CSS:
    - Identify classes that are no longer referenced in any `.tsx` file
    - Remove unused classes (e.g., old `.lp-*` utilities that were replaced)
  - Ensure `@import` and `@plugin` directives are correct:
    - `@import "tailwindcss"` present
    - `@plugin "@tailwindcss/typography"` present
    - `@import "tw-animate-css"` present
  - Verify `html` and `body` base styles:
    - Dark background (`bg-background`)
    - White/grey foreground (`text-foreground`)
    - No hardcoded colors
  - Run final build and typecheck:
    - `bun --cwd apps/web run build`
    - `bun --cwd apps/web run typecheck`
  - Save post-optimization metrics to `.sisyphus/evidence/post-optimization-metrics.txt`
    - CSS line count
    - Bundle size
    - Number of chunks
    - Build time

  **Must NOT do**:
  - Do NOT break existing styles
  - Do NOT remove styles still referenced by components

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 18, 19)
  - **Parallel Group**: Wave 5
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 14-19

  **References**:
  - `apps/web/src/styles.css` - Final CSS audit
  - `.sisyphus/evidence/baseline-metrics.txt` - Baseline comparison
  - All `.tsx` files in `apps/web/src/` - To check CSS class references

  **Acceptance Criteria**:
  - [ ] CSS file under 400 lines
  - [ ] Zero heavy effects (backdrop-filter, feTurbulence, mask-image)
  - [ ] Zero non-greyscale colors
  - [ ] Build passes
  - [ ] Typecheck passes
  - [ ] Post-optimization metrics recorded

  **QA Scenarios**:

  ```
  Scenario: Final CSS audit passes
    Tool: Bash
    Steps:
      1. Run `wc -l apps/web/src/styles.css`
      2. Run `grep -c "backdrop-filter\|feTurbulence\|mask-image" apps/web/src/styles.css`
      3. Run `grep -E "oklch\(|hsl\(|#" apps/web/src/styles.css | grep -iv "gray\|grey\|white\|black\|slate\|zinc\|neutral\|stone\|red" | wc -l`
      4. Run `bun --cwd apps/web run build 2>&1 | tail -5`
    Expected Result: <400 lines, 0 heavy effects, 0 non-greyscale colors, build succeeds
    Evidence: .sisyphus/evidence/task-20-final-audit.txt
  ```

  **Commit**: YES
  - Message: `perf(web): final CSS cleanup and optimization`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + `oxlint .` + `oxfmt --check .` + `bun run build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Format [PASS/FAIL] | TypeCheck [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: unauthenticated dashboard, OAuth callback, empty leaderboard, mobile viewport. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `chore(web): initialize shadcn/ui with buFzFmS preset` - components.json, package.json, new shadcn files
- **Wave 2**: `style(web): apply grey/white theme and optimize CSS` - styles.css
- **Wave 3**: `refactor(web): migrate to shadcn/ui components` - components/ui/\*.tsx, import updates
- **Wave 4**: `feat(web): overhaul pages with new design system` - routes/_.tsx, components/_.tsx
- **Wave 5**: `perf(web): implement lazy loading and bundle optimization` - routes/\*.tsx, vite.config.ts
- **Wave FINAL**: `chore(web): final verification and cleanup` - any remaining fixes

---

## Success Criteria

### Verification Commands

```bash
# Build verification
bun --cwd apps/web run build
# Expected: Build succeeds, no errors

# Type check
bun --cwd apps/web run typecheck
# Expected: tsc --noEmit passes

# Lint
oxlint apps/web/src
# Expected: No errors

# Format check
oxfmt --check apps/web/src
# Expected: No formatting issues

# Bundle size check
ls -la apps/web/dist/assets/*.js 2>/dev/null || ls -la apps/web/dist/client/assets/*.js
# Expected: Total JS < baseline * 0.8 (20% reduction target)

# CSS audit
grep -c "backdrop-filter\|feTurbulence\|filter: blur" apps/web/src/styles.css
# Expected: 0

# Greyscale audit
grep -E "oklch\(|hsl\(" apps/web/src/styles.css | grep -iv "gray\|grey\|white\|black\|slate\|zinc\|neutral\|stone" | wc -l
# Expected: 0

# shadcn initialized
test -f apps/web/components.json && echo "exists"
# Expected: "exists"

# hugeicons installed
grep -q "hugeicons" apps/web/package.json && echo "installed"
# Expected: "installed"
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] Build passes
- [x] Typecheck passes
- [x] Lint passes
- [x] Format check passes
- [x] Bundle size reduced
- [x] CSS heavy effects removed
- [x] Grey/white color audit passes
- [x] All routes render without errors
- [x] Discord login works end-to-end
- [x] No hydration warnings
