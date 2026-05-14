# AGENTS.md

## Project Context

Parley is a high-performance competitive matchmaking and tournament platform. The architecture integrates a Rust-based backend with a TypeScript web dashboard and Discord bot, running on Cloudflare Workers and Bun.

## Build & Execution Commands

Agents must use the following commands to navigate, build, and test the repository.

### Rust Core

- **Build:** `cargo build`
- **Test:** `cargo test`
- **Run:** `cargo run`

### TypeScript / Web

- **Package Management:** `bun install`
- **Type Checking:** `tsc --noEmit`
- **Build:** `tsc` (or `bun run build` depending on package script)

## Linting & Formatting

Strict adherence to the project's formatting tools is mandatory. Agents must ensure all code passes these checks before completing a task.

### Rust

- **Formatting:** `cargo fmt` (uses `rustfmt`)
- **Linting:** `cargo clippy -- -D warnings`

### TypeScript & JavaScript

- **Formatting:** `oxfmt .`
- **Linting:** `oxlint`

## Code Style & Conventions

### Commenting Standards

- **CRITICAL RULE:** Do absolutely **not** use visual divider comments or ASCII art lines (e.g., `// ======`, `// -------`, `// *****`).
- Maintain a clean, professional, and standard commenting style.
- Document public APIs using standard `///` for Rustdoc and `/** ... */` for TSDoc.
- Inline comments (`//`) must explain _why_ a complex decision was made, not _what_ the code is doing.

### Engineering Rules

- **Rust:** Adhere to idiomatic Rust. Handle `Result` and `Option` types explicitly; do not use `.unwrap()` or `.expect()` unless in test files.
- **TypeScript:** Strict mode is enforced. Avoid `any` at all costs. Prefer functional, immutable data patterns.
- **Discord Integrations:** Never hardcode raw Discord emoji ID strings. UI construction must rely exclusively on the custom type-safe API wrapper for Embeds and Components v2.

## Workflow & PR Instructions

1. Run `cargo fmt` and `oxfmt .` after modifying files.
2. Run `cargo clippy` and `oxlint` to catch structural issues.
3. Ensure both `cargo test` and `bun test` pass.
4. Add or update tests for any new logic introduced.
