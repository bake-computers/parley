# Why Parley is built the way it is

By ryzm / August 4, 2026

The reasoning behind the stack: the decisions and their trade-offs, not the documentation. The diagram below shows how the pieces fit together.

![Overview diagram of Parley's architecture](https://parley.bot/assets/parley-architecture-overview.webp)

## One engine owns the truth.

Account links, ratings, match records, and brackets all live in one Postgres database behind one Go service. The edge apps are stateless and disposable: they hold nothing, so they can be redeployed at will.

## A shared schema, not shared code.

The wire contract is defined once in protobuf and generated into both Go and TypeScript. Engine and edge never share structs. A change is wire-compatible, or it does not merge.

## The edge lives where players are.

The Discord bot and this site run on Cloudflare Workers: stateless, global, and zero servers to babysit. Interactions are answered close to the player; the domain work is delegated to the engine.

## RPC over plain HTTP.

ConnectRPC gives us typed RPCs without the browser and Worker baggage of gRPC. It is just HTTP, which every client already speaks.

## A boring database.

Postgres is the system of record: relational data, transactions, and migrations that only ever add. Nothing exotic to learn, nothing exotic to lose data.

## A model you can audit.

The matchmaking score is a single linear model: seven numbers. It decides who plays with whom, so we chose something that can be printed, diffed, and argued with over a black box that must be trusted. Every parameter of complexity beyond linearity is a parameter of opacity.

## Model deployment is a file upload.

Models arrive as objects and are strictly validated at startup, so anything unexpected fails to load. The engine does not boot without a model it can fully verify. No registry, no canary machinery; rolling back is uploading the previous object.

## Glicko-2 keeps the memory.

The score decides tonight's teams; Glicko-2 carries persistent ratings forward across matches. Proven, lightweight, well understood: the right amount of machinery for remembering results.

## Exhaustive, not heuristic.

Team selection enumerates every valid split of the lobby, because lobbies are small enough to do so. The result is a genuine optimum of the objective, not an approximation of one.

## What we did not build.

No feature store, no GPU path, no embedding service, no model-version table. Each would answer a question Parley does not have. The contracts are built so that if one ever arrives, the system grows without rewriting what is here.

---

Regards,
ryzm

Also available as HTML: <https://parley.bot/blog/why-parley-is-built-the-way-it-is>
