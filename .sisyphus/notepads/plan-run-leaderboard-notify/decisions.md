# Decisions

- Use fire-and-forget for DO notifications to avoid impacting match completion latency.
- Use URL+init fetch call pattern to satisfy TypeScript types across this codebase.
- Do not implement retries for DO notifications; limit to a single attempt with swallow-on-failure behavior.
