## Architectural decisions
- Defer leaderboard command reply before loading emoji catalog and DB-bound work to prevent Discord timeout issues.
- Introduce slot-based pagination IDs to guarantee uniqueness across all pagination buttons, even with a single page.
- Extend pagination ID helpers to carry an optional slot and ignore it when reconstructing state (parsing focuses on viewId/page).
