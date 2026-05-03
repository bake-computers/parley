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
