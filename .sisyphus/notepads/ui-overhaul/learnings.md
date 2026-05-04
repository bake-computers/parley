
## Task 16: Dashboard Discord Login Flow (2026-05-04)

### Patterns Used
- Hugeicons Discord icon: `DiscordIcon` from `@hugeicons/core-free-icons`, rendered via `HugeiconsIcon` wrapper from `@hugeicons/react`
- better-auth social login: `authClient.signIn.social({ provider: "discord", callbackURL: "/dashboard" })`
- Session hook: `authClient.useSession()` returns `{ data: session, isPending }`
- Logout pattern: `await authClient.signOut(); window.location.reload()`
- shadcn Card composition: Card > CardHeader/CardContent/CardFooter for structured panels
- Avatar with fallback: Avatar > AvatarImage (conditional) + AvatarFallback with initial

### Key Decisions
- Replaced all `depth-panel` custom styling with shadcn `Card` components for cleaner, standardized UI
- Updated toggle switch colors from custom `bg-accent-blue`/`bg-depth-3` to `bg-primary`/`bg-muted` for theme consistency
- Updated divider colors from `bg-white/5` to `bg-border`
- Updated input styling to use `border-input`, `bg-background`, `focus:border-ring`
- Kept the global dark mode; achieved "grey/white" aesthetic through standardized shadcn component colors

### File Changes
- apps/web/src/routes/dashboard/index.tsx
- apps/web/src/routes/dashboard/\$guildId/index.tsx
- apps/web/src/routes/dashboard/\$guildId/history.tsx

## F3 QA Learnings (2026-05-04)

### Testing Approach
- Playwright with Chromium headless works well for automated UI QA
- Need to capture `requestfailed` events separately to distinguish asset 404s from API failures
- Hydration mismatches show up as `[PAGE ERROR]` in Playwright console listeners

### Key Finding: Dashboard Hydration Mismatch
- **Root cause**: `apps/web/src/routes/dashboard/index.lazy.tsx` has conditional rendering based on auth state (`isPending`, `session`)
- Server renders loading spinner (`className="min-h-screen flex items-center justify-center"`) while client renders unauth card (`className="min-h-screen flex items-center justify-center px-4"`)
- This is a classic SSR/client auth state divergence

### Environment Note
- Backend API server (port 8787) was not running during QA, causing expected `ERR_CONNECTION_REFUSED` on `/api/auth/get-session` and `/api/leaderboard`
- No static asset 404s were observed — all failures were API/backend calls
