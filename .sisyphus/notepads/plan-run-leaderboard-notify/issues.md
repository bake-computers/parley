# Issues

- Type-check integration with Cloudflare Workers fetch caused TS2307/TS2345 errors when passing a Request object. Resolved by using fetch(url, init) instead of new Request(url, init).
- Full workspace typecheck reported unrelated module resolution errors in @parley/db/queries; this patch does not address repo-wide type resolution, but local changes compile under standard fetch usage patterns.
