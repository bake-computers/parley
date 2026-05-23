# F2 Code Quality Review — Issues

## Blocking Issues (Lint Errors)

1. **index.ts:11** — `require-await`: async function has no await. Remove `async` keyword.
2. **link.test.ts:92,93,142,143,181,182** — `curly`: 6 missing curly braces on if statements. Add `{ }`.
3. **link.test.ts:171** — `no-unsafe-optional-chaining`: unsafe chaining in assertion.
4. **packages/db/src/index.ts** — `no-empty-file`: empty file.

## Production Code Smells

1. **transport.ts:18,33** — `as never` type assertion on service types. Should define proper types.
2. **link.ts:49-50** — `!` non-null assertions on `.getString(_, true)` — redundant since `true` already guarantees non-null.
3. **link.ts:66** — `as unknown as IdentityClient` double cast bypassing type system.
4. **profile.ts:47** — `as IdentityClient` cast, same root cause as transport.ts typing issue.
5. **register-commands.ts:5-9** — `as string` on dynamic import paths.

## Format Issues

72 files have formatting discrepancies. Run `bun run format` (oxfmt --write) to fix.
