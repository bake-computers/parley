- Task 1: No known problems at this time. All design token definitions and utility classes are present in both web and HQ stylesheets as per plan.

## Unresolved Technical Debt — Code Quality F2 Review

### Date: 2026-05-04

### Remaining Issues (post-cleanup commit 896829b)

1. **Production console.log in db.ts**
   - File: `apps/hq/src/lib/server/db.ts:30`
   - Risk: Logs connection strings (even redacted) in production
   - Fix: Remove or guard behind a debug flag

2. **Widespread `as any` casts**
   - Files: `apps/hq/src/lib/server/guild-access.ts`, `apps/web/src/hooks/use-leaderboard-ws.ts`, `apps/worker/src/index.ts`, `apps/worker/src/leaderboard-handler.ts`, `apps/worker/src/leaderboard-do.ts`, `packages/auth/src/index.ts`
   - Root cause: Better-auth session types and Cloudflare Workers DO/WebSocket types lack precise TypeScript definitions
   - Fix: Add explicit interface definitions or use `@ts-expect-error` with comments instead of `as any`

3. **Empty catch blocks without comments**
   - File: `apps/hq/src/lib/server/guild-settings.ts` (9 instances)
   - Fix: Add explanatory comments to each catch block

4. **LeaderboardDO uses non-Hibernation API WebSocket pattern**
   - File: `apps/worker/src/leaderboard-do.ts`
   - Note: Uses `(globalThis as any).WebSocketPair` and manual `serverWs.onmessage` instead of `ctx.acceptWebSocket()`
   - Risk: May not handle DO hibernation correctly in production
   - Fix: Refactor to use Cloudflare Hibernation API (`ctx.acceptWebSocket`, `webSocketMessage`, `webSocketClose`)
