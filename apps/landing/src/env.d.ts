declare namespace Cloudflare {
  interface Env {
    BRIDGE: Fetcher;
    KV: KVNamespace;
    MATCH_KV: KVNamespace;
  }
}
