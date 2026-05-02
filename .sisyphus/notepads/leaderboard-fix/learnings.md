What I learned

- When loading Discord interactions, prefer deferring the reply before any slow work (like REST calls or emoji catalog resolution) to avoid Discord's 3s timeout.
- Provide a robust channel resolution path by allowing channel_id field as fallback when channel object is missing.
- Use slot-based pagination IDs to ensure uniqueness even when there is only a single page; this mirrors the pattern used in the stats command.
- Centralize pagination ID construction to support optional slot parameter and ignore it during parsing, to keep the state consistent.
