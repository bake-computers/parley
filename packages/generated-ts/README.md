# @parley/proto

TypeScript types + ConnectRPC clients generated from the root `proto/` directory
— the single source of truth shared with the Rust `engine-service`.

## Regenerate

```bash
cd packages/generated-ts
bun install          # or: npm install / pnpm install
bun run generate     # reads ../../proto via ../../buf.gen.yaml
```

Output is written under `src/<package>/<version>/*_pb.ts` (messages) and
`*_connect.ts` (service descriptors).

## Using

```ts
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { StatsService } from "@parley/proto/stats/v1/stats_connect.js";

const transport = createConnectTransport({
  baseUrl: "http://localhost:50051",
});
const stats = createClient(StatsService, transport);

const res = await stats.fetchStats({
  username: "vSqro",
  platform: "STATS_PLATFORM_XBOX",
});
console.log(res.stats?.rankedStats?.currentRank);
```

## Contract

The wire format is whatever `parley.{stats,engine,ocr}.v1` proto definitions
say it is. The Rust server (`apps/engine-service`) implements those same
RPCs on `/{package}.{Service}/{Method}` endpoints and accepts both
`application/json` and `application/proto` content types, so this client
works out of the box.
