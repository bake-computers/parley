# Issues Found During F3 QA

## CRITICAL: Worker Build Failure (buf v1→v2 incompatibility)
- **Status**: BLOCKING
- **Symptoms**: `wrangler dev` and `wrangler deploy --dry-run` fail with 2 esbuild errors
- **Root Cause**: `@bufbuild/protoc-gen-es` v2 + `@connectrpc/protoc-gen-connect-es` v1 produce incompatible generated code targeting different `@bufbuild/protobuf` runtime versions
  - v2 es plugin generates `_pb.ts` files; v1 connect plugin references `_pbjs` (import mismatch)
  - v1 connect plugin imports `MethodKind` from `@bufbuild/protobuf` which was removed in v2
- **Impact**: Worker CANNOT start or deploy. `tsc` passes only because generated files use `@ts-nocheck`.
- **Affected files**: ALL connect files (stats, engine, ocr, guild, identity) — systemic issue
- **Resolution options**:
  - Downgrade `@bufbuild/protoc-gen-es` and `@bufbuild/protobuf` to v1.x to match connect-es v1
  - OR find a connect-es v2 plugin (does not appear to exist yet)

## HIGH: app.ts Missing Command Handlers
- **Status**: FIXED during QA
- **Symptom**: Only ping and profile loaded; help and link were defined but never registered
- **Fix**: Added import + loadHandlers for helpCommand and linkCommand

## MEDIUM: LSP Errors in Test Files
- Test files show "Cannot find module" for relative `.js` imports (dynamic imports)
- These resolve correctly at test runtime (bun test passes)
- Likely a tsconfig/LSP config issue, not functional
