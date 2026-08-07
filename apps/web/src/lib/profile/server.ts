import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { engineEnvFromCloudflare } from "../engine/env.js";
import { rpcGetPublicProfile, type GetPublicProfileResult } from "./rpc.js";

const USERNAME_RE = /^[a-zA-Z0-9._]{2,32}$/u;

function validateUsername(raw: string): string {
  const username = raw.trim().replace(/^@+/u, "");
  if (!USERNAME_RE.test(username)) {
    throw new Error("Invalid username");
  }
  return username;
}

/** Public profile fetch by Discord username (no auth). */
export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator(validateUsername)
  .handler(({ data: username }): Promise<GetPublicProfileResult> => {
    return rpcGetPublicProfile(engineEnvFromCloudflare(env), username);
  });
