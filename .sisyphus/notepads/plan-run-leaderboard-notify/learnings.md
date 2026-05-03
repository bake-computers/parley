# Learnings

- Implementing fire-and-forget notifications via a Leaderboard DO after match completion is viable, but IO should never block core match flow. Used a guarded async path to avoid blocking and catch-all error handling.
- Replaced direct Cloudflare Request usage with a URL+init form to satisfy TS typings in this environment.
- Ensure all changes are isolated to the notification path and do not alter business logic.
