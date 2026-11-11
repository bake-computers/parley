# Why we left Axiom

By Parley engineering / August 15, 2026

The logging setup grew until it cost more to run than the events were worth. This post is the reasoning behind the swap and the short list of what we kept.

## We were shipping everything.

Every log line went to Axiom: boot messages, debug noise, health probes, "loaded this", "listening on that". Shipping everything is the easiest way to start and the hardest way to keep a log product useful. The signal drowned in the noise, and the bill grew with it.

## Axiom is a live log product. We do not need a live tail.

Axiom is built for live tailing and interactive exploration, and it is good at both. Parley's operators almost never tail logs in real time. What they need is a place where the events that matter are kept, queryable weeks later, at a price that does not depend on how chatty the code is.

## Cloudflare already runs the edge. Pipelines writes Iceberg and Parquet to R2.

The Discord worker and this site already run on Cloudflare. Pipelines is the same platform: the worker posts events to a stream binding, and Cloudflare writes them as Iceberg and Parquet into R2. No new vendor, no new dashboard, no extra hop for data that starts at the edge anyway.

## Delay is fine. Query with SQL later.

A live tail buys you a second of freshness. Our events are diagnostic, not operational: nobody pages on a slow query. Minutes of delay are acceptable, and SQL over Parquet answers "how many lobbies partitioned badly this week" just fine. We traded a live UI for storage we already pay for.

## What we keep: requests, slow or failed queries, OVI partition results, real failures.

The allowlist is short. Every request event from the engine and the worker, with the Discord terminals merged in. Database queries slower than 50 milliseconds, or that failed. One matchmaking event per successful partition, with team scores, balance gap, and the player list. Anything at warn level or above. That is enough to debug a lobby, a migration, or a bad deploy.

## What we drop: boot noise, debug, "loaded this".

"Engine listening", "migrations applied", "model loaded", health probes: all of it stays on stderr for humans and never leaves the box. Debug lines never ship, full stop. If a startup problem happens, the container logs have it.

## Local sends nothing.

Local development is exactly as loud as it was: JSON to stderr. The engine only opens a pipeline connection when both PIPELINES_INGEST_URL and PIPELINES_TOKEN are set, and the worker only has a pipeline binding in production. "It worked locally" is never contaminated by a half-configured remote.

The old setup shipped everything and used almost none of it. The new one ships a small, deliberate set and uses more of it.
