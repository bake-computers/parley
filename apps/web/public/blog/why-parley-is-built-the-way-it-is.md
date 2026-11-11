# Why Parley is built the way it is

By Parley engineering / August 4, 2026

The reasoning behind the stack: the decisions and their trade-offs, not the documentation. The diagram below shows how the pieces fit together.

![Overview diagram of Parley's architecture](https://parley.bot/assets/parley-architecture-overview.webp)

## One engine owns the truth.

Account links, ratings, match records, and brackets all live in one Postgres database behind one Go service. The edge apps are stateless and disposable: they hold nothing, so they can be redeployed at will.

Microservices were considered and rejected. One engineer maintains this project, and service boundaries here would add deploys, wire hops, and cross-service coordination where today there is one process and one schema. The monolith is sized to the team, not to the ambition.

## A shared schema, not shared code.

The wire contract is defined once in protobuf and generated into both Go and TypeScript. Engine and edge never share structs. A change is wire-compatible, or it does not merge.

The alternatives are a library shared across two languages (one build system serving both) or handwritten JSON types kept in sync by review. Both fail the same way eventually: one side drifts, and the bug surfaces mid-lobby at runtime instead of at build time. Generating from one source lets each language's compiler do the checking.

## The edge lives where players are.

The Discord bot and this site run on Cloudflare Workers: stateless, global, and zero servers to babysit. Interactions are answered close to the player; the domain work is delegated to the engine.

The rejected alternative was hosting the bot beside the engine on one box. It would have worked, but Discord interactions are latency-bound and players are everywhere, so answering from a single region trades reach for a machine to patch and keep alive.

## RPC over plain HTTP.

ConnectRPC gives us typed RPCs as ordinary HTTP requests. Native gRPC is built on HTTP/2 end to end, and Workers cannot speak it from fetch. Running gRPC at the edge would mean proxies and protocol translation. The Connect protocol is a standard POST with a JSON or protobuf body: HTTP/1.1-compatible, readable with curl, and callable from anything that can fetch.

## A boring database.

Postgres is the system of record: relational data, transactions, and a migration story we understand. Nothing exotic to learn, nothing exotic to lose data.

We prefer additive, backwards-compatible migrations so deployments do not require synchronized cutovers: old code keeps serving against the new schema while new code rolls out. Renames, backfills, constraints, and removals still happen. They happen in stages, never in one coordinated flag day.

The alternative was a store per concern: one for ratings, one for brackets, one for identity. Postgres won because it is boring, reliably so, and because I know it well. Three stores would have been three backups, three failure modes, and a distributed transaction where one database gives you a local one.

## A model you can audit.

The matchmaking score is a single linear model: six weights, one per dimension of each player's dual-anchor playstyle vector (K/D, entry, trade, clutch, exec, and season win rate). It decides who plays with whom, so we chose something that can be printed, diffed, and argued with over a black box that must be trusted. Every parameter of complexity beyond linearity is a parameter of opacity.

A nonlinear model would likely predict a touch better. The cost is that when someone asks why their lobby looks the way it does, the honest answer becomes "the model said so," and a matchmaking system that cannot explain itself cannot be fixed when it is wrong.

## Model deployment is a file upload.

Models arrive as objects and are strictly validated at startup, so anything unexpected fails to load. A new engine instance does not become ready unless it can fully validate and load its model; a bad upload leaves the healthy deployment serving instead of taking it down. No registry, no canary machinery; rolling back is uploading the previous object.

## Glicko-2 keeps the memory.

The score decides tonight's teams; Glicko-2 carries persistent ratings forward across matches. Proven, lightweight, well understood: the right amount of machinery for remembering results.

The alternatives were a hand-rolled Elo with its known blind spots, or a heavier Bayesian stack that buys little here beyond more to tune. Glicko-2 is published mathematics that decays uncertainty when players go quiet, and it runs in microseconds inside the engine we already have.

## Exhaustive, not heuristic.

Team selection enumerates every valid split of the lobby, because lobbies are small enough to do so. The result is a genuine optimum of the objective, not an approximation of one.

Greedy or sampled search is the right move once the search space outgrows the clock. Below that threshold, a heuristic is the same work with an error term bolted on, so we enumerate.

## What we did not build.

No feature store, no GPU path, no embedding service, no model-version table. Each would answer a question Parley does not have, and each was weighed against the same cost: another thing to operate, secure, and keep honest. The contracts are built so that if one ever arrives, the system grows without rewriting what is here.

---

Also available as HTML: <https://parley.bot/blog/why-parley-is-built-the-way-it-is>
