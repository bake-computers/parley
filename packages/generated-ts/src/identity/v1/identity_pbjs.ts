// Bridge: buf connect-es imports "./identity_pbjs" but buf es generates "identity_pb.ts".
// This re-export file bridges the naming gap for esbuild (wrangler) resolution.
export * from "./identity_pb.js";
