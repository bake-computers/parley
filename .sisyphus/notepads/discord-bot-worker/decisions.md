# Decisions - Discord Bot Worker

## Architecture Decisions
1. **apps/worker vs apps/bot**: Deliberate deviation from SPEC.md — user chose apps/worker
2. **Discord-only worker**: Old /stats, /ocr, /health REST routes removed
3. **Module-scope transport**: ConnectRPC clients cached at module level (latency savings for 3-second Discord SLA)
4. **GAME_R6 default**: /link defaults to R6; /profile uses GAME_UNSPECIFIED to show all games
5. **Alchemy from scratch**: No existing Alchemy config; build alchemy.run.ts

## Pending Decisions
- Actual Discord Application ID and credentials (placeholder values used)
- Skylink NL backend hostname for placement config
- Cloudflare API token for Alchemy deployment
