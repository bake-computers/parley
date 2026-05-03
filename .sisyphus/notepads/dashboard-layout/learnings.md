# Dashboard Layout + Navigation Shell

## Files Created

- `apps/hq/src/components/dashboard-context.tsx` — React context for sharing selected guild state and mobile sidebar toggle between `HqDashboard` and `DashboardLayout`.
- `apps/hq/src/components/sidebar.tsx` — Dark depth-panel sidebar with Parley logo, guild context header, navigation items (Home, Settings, Players, Match History, Tournaments, Match Rules, Notifications), active gradient highlight, and mobile collapsible overlay.
- `apps/hq/src/components/dashboard-layout.tsx` — Main layout wrapper that conditionally renders sidebar for authenticated users with guild access.
- `apps/hq/src/routes/guild/$guildId/settings.tsx` — Route shell with server function + AuthGuard.
- `apps/hq/src/routes/guild/$guildId/players.tsx` — Route shell with server function + AuthGuard.
- `apps/hq/src/routes/guild/$guildId/matches.tsx` — Route shell with server function + AuthGuard.
- `apps/hq/src/routes/guild/$guildId/tournaments.tsx` — Route shell with server function + AuthGuard.
- `apps/hq/src/routes/guild/$guildId/rules.tsx` — Route shell with placeholder server function + AuthGuard.
- `apps/hq/src/routes/guild/$guildId/notifications.tsx` — Route shell with placeholder server function + AuthGuard.

## Files Modified

- `apps/hq/src/routes/__root.tsx` — Wrapped app with `DashboardProvider` and `DashboardLayout`.
- `apps/hq/src/components/hq-dashboard.tsx` — Replaced local `selectedGuild` state with `useDashboard` context.

## Verification

- Build: pass (exit 0)
- Tests: 6 successful, 0 failed
- oxlint: 0 errors, only pre-existing warnings
- oxfmt: all matched files use correct format

## Design Decisions

- Used React context (`DashboardContext`) to share selected guild between `HqDashboard` guild selector and `Sidebar` guild header, avoiding prop drilling through the layout.
- Sidebar active state uses `useLocation` from TanStack Router (not global `location`) for SSR safety.
- DashboardLayout conditionally hides sidebar for unauthenticated/forbidden users by checking `useGuildAccess` result.
- Guild routes use inline `createServerFn` wrappers to pass URL params to existing server functions.
