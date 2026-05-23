// Bridge: buf connect-es imports "./guild_pbjs" but buf es generates "guild_pb.ts".
// This re-export file bridges the naming gap for esbuild (wrangler) resolution.
export * from "./guild_pb.js";
