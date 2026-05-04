## Wave 1: Design System Tokens + Fundamentals

### Architecture

- Both `apps/web` and `apps/hq` share identical `:root` token structure and `@theme inline` mappings
- Tailwind CSS 4 with CSS-first config — `@theme inline` maps CSS custom properties to Tailwind utilities
- CVA (class-variance-authority) used for component variants in button.tsx, badge.tsx
- Card component was plain div-based; upgraded to CVA for depth variant support
- `cn()` utility uses clsx + twMerge for class merging

### Token Design

- Depth backgrounds: #0a0a0f → #2a2a38 (5 levels, deep dark palette)
- Accent colors: #3b82f6 (blue), #06b6d4 (cyan) — registered as `--color-accent-blue/cyan` in @theme
- Elevation shadows: 5 levels (none through dramatic multi-layer shadows)
- Animation: 3 durations (150/300/500ms) + 2 easings (out, in-out)
- Typography: 8 fluid clamp() sizes from xs to 4xl
- Spacing: 11 values from 0.25rem to 5rem
- Radius tokens updated from uniform 0.14rem to proper scale (0.25/0.375/0.5/0.75rem)

### Utility Classes

- `.depth-panel`: Glass morphism with gradient bg, blur, elevation-2 shadow
- `.gradient-text`: Blue→cyan text gradient with @supports fallback
- `.glow-border`: Gradient border via mask-composite trick
- `.shimmer`: Animated shine sweep using translateX keyframes

### Component Variants

- Button: `depth` variant — glass bg, elevation hover transition
- Card: CVA added with `default` and `depth` variants; depth uses `.depth-panel` class
- Badge: `gradient-blue`, `gradient-cyan`, `gradient-mixed` variants with glow shadows
- Separator: Created for web (matches hq pattern using Radix primitive)

### Verification

- Token count: 105 in web, 121 in hq (both well over 20+)
- LSP diagnostics: 0 errors on all TS files
- Typecheck: passes (pre-existing worker error unrelated)
- Lint: 0 errors, 6 pre-existing warnings

## Wave 2: Landing Page Sections (How it Works, Community Stats, FAQ)

### Component Patterns

- Section layout: `<section className="lp-section">` with label + heading div, then content
- Label pattern: `<p className="lp-label mb-2">Category</p>`
- Heading pattern: `<h2 className="text-3xl md:text-4xl font-bold tracking-tight">`
- Gradient text accent: `<span className="gradient-text">word</span>`
- Cards use `depth-panel` class for glass morphism effect
- BEM-like naming for component-scoped CSS: `component__element`

### CSS Architecture

- Component CSS lives in `styles.css` with section-divider comments (`/* ── Section Name ── */`)
- Responsive breakpoints: 1180px (3→2 cols), 840px (2→1 cols), 560px (compact)
- Design tokens used throughout: `--text-*`, `--space-*`, `--duration-*`, `--ease-*`, `--depth-*`, `--accent-blue/cyan`
- FAQ accordion uses CSS `grid-template-rows: 0fr/1fr` trick for smooth height animation (no JS height calc needed)
- Connector arrows between steps use CSS `::after` pseudo-elements with border tricks

### Accessibility

- FAQ uses `aria-expanded` on trigger buttons and `data-open` attribute for CSS state
- Connectors use `aria-hidden="true"` since they're decorative
- Focus-visible styles use `--accent-blue` outline
- Implemented WebSocket leaderboard DO with WebSocketPair upgrade flow, per-connection attachment storage, and cache broadcasting.
- Added a fire-and-forget /api/leaderboard/notify endpoint to forward match-completion events to the DO stub for processing and cache refresh.
- Created a frontend hook apps/web/src/hooks/use-leaderboard-ws.ts to connect, subscribe, and keep a local state with exponential backoff reconnect.
- Implemented a lightweight WebSocket broadcast to all connected clients on cache updates and added per-connection range subscriptions via SUBSCRIBE messages.
- Tests run: workspace test suite passed (including worker/core/db/auth components). WebSocket tests are scaffolding; integration tests should verify /ws/leaderboard behavior in CI.
- Implemented WebSocket leaderboard DO with WebSocketPair upgrade flow, per-connection attachment storage, and cache broadcasting.
- Added a fire-and-forget /api/leaderboard/notify endpoint to forward match-completion events to the DO stub for processing and cache refresh.
- Created a frontend hook apps/web/src/hooks/use-leaderboard-ws.ts to connect, subscribe, and keep a local state with exponential backoff reconnect.
- Implemented a lightweight WebSocket broadcast to all connected clients on cache updates and added per-connection range subscriptions via SUBSCRIBE messages.
- Tests run: workspace test suite passed (including worker/core/db/auth components). WebSocket tests are scaffolding; integration tests should verify /ws/leaderboard behavior in CI.

- Note: Next steps include adding end-to-end tests for subscribe/broadcast semantics and ensuring DO alarm scheduling interacts correctly with the Postgres-backed cache refresh.

## Wave 2: Hero Section Redesign

### Architecture Decisions

- Used CSS `translate` property (not `transform`) for entrance animations to avoid conflicts with 3D `transform` on stat cards
- Wrapped each FloatingStatCard in a `hero-animate` div to separate entrance animation from 3D hover transforms
- Added `gradient` variant to Button CVA instead of creating a separate GradientButton component
- Used existing `.depth-panel` and `.gradient-text` utility classes for the stat cards and title
- FloatingStatCard uses accent dot (not border) for color indication — avoids border-radius/border-image conflicts

### CSS Patterns

- Hero entrance: `hero-fade-up` keyframe animates `opacity` + `translate` (individual property), `transform` reserved for 3D card rotations
- Noise texture: SVG feTurbulence data URI with slow drift animation (20s linear infinite)
- 3D stat cards: `perspective: 800px` on container, `rotateY/rotateX` on individual cards with different angles per `:nth-child`
- Responsive: cards lose 3D transforms below 840px, stack vertically below 560px
- `prefers-reduced-motion: reduce` disables all hero animations and 3D transforms

### Component Structure

- `FloatingStatCard`: simple presentational component with value/label/accent props, uses `depth-panel` + `hero-stat-card` classes
- Hero uses `hero-bg` (gradient background) + `hero-noise` (animated texture overlay) on the section
- `hero-content`: 2-column grid (1fr auto) on desktop, single column on mobile
- `hero-cta-gradient`: CSS class for glow hover effect on gradient CTA button

## Wave 2: Dashboard Auth Flow UI

### Architecture

- Per-guild auth flow: Discord login → guild list → guild management
- `readDashboardAuth` in `apps/hq/src/lib/server/auth.ts` allows any authenticated Discord user (not just global admins), returning `isGlobalAdmin` flag
- `DashboardAuthResult` type: `signed_out | forbidden | authorized` (with `isGlobalAdmin` on authorized)
- `DashboardPageData.auth` now includes `isGlobalAdmin: boolean` on the `authorized` variant
- `getGuildAccessForUser` server function in `guild-access.ts` returns `{ guilds, adminGuilds, isGlobalAdmin }`
- `useGuildAccess` hook wraps TanStack Query with 5-minute stale time, returns `{ guilds, adminGuilds, isGlobalAdmin, isLoading, error }`

### Auth Flow States

- `signed_out` → "Sign in with Discord" + "Administrator permission required" subtitle
- `forbidden` → "No admin access" message (no Discord account linked)
- `authorized + isGlobalAdmin` → Dashboard directly (selectedGuild defaults to null = "All Servers")
- `authorized + !isGlobalAdmin` → Guild selector first, then dashboard for selected guild
- `authorized + no admin guilds + !isGlobalAdmin` → "No admin access" message

### Key Decisions

- Global admins skip the guild selector (`selectedGuild = null`) and see the dashboard directly
- Guild admins must pick a server first (`selectedGuild = undefined` → guild selector)
- `AuthGuard` component validates per-guild access, shows 403 if no permission
- `GuildSelector` shows "All Servers" card for global admins, individual guild cards for guild admins
- `DashboardContent` calls `useNavigate` directly (not passed as prop) to preserve TanStack Router generic types

### Gotchas

- TanStack Router's `navigate` function has complex generics that don't survive prop passing — call `useNavigate` directly in child components
- `readDashboardAuth` uses `auth.api.getSession({ headers })` with `as any` cast for headers type compatibility
- `GuildWithPermissions` from `@parley/auth` has `icon: string | null` and `permissions: number`; the core package has a different shape — always use the auth package version
- `useGuildAccess` accepts `enabled` param to avoid fetching when user is not authenticated

- Scope Fidelity Check: 12/20 tasks evidenced (2-7, 14-20); 1 and 8-13 lack evidence in the evidence folder. This indicates gaps between plan and implemented work. Recommend aligning plan-to-evidence mapping for future waves.
