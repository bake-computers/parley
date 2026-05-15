# Vessel Rust Engine - Issues & Gotchas

## Session Start: 2026-05-14T20:13:16.255Z

### [ISSUE] parley is a binary crate, not a library
- `parley = { path = "../../" }` in vessel's Cargo.toml warns "ignoring invalid dependency `parley` which is missing a lib target"
- Root Cargo.toml only has `[[bin]]`, no `[lib]`
- Tasks 7, 12 need to import `crate::db::models`, `crate::db::schema`, etc.
- **Resolution needed**: Either add `[lib]` to root Cargo.toml (may affect compilation) or restructure shared DB types. Will address before Tasks 7/12.
