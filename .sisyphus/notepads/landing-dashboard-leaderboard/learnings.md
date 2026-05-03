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
