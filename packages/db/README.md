# @parley/db — **frozen**

This package is the legacy Drizzle schema for Parley v1. It is **no longer
the source of truth**.

The canonical schema is now the Diesel migrations in `/migrations` and the
Rust bindings in `/src/db/schema.rs`. See `/docs/db.md` for the schema
documentation, rename map, and the `game` discriminator convention.

This package is retained temporarily so any remaining in-flight TypeScript
code can still typecheck against the Drizzle definitions. It will be
removed in a follow-up cleanup once every consumer has migrated.

Do not add tables, columns, or migrations here — edit the Diesel migrations
instead.
