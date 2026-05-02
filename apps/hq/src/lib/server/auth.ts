import { createParleyAuth, readSessionAccess } from "@parley/auth";
import { env } from "cloudflare:workers";
import type { DbClient } from "@parley/db/client";

export function createDashboardAuth(db: DbClient) {
  return createParleyAuth(db, env);
}

export function readDashboardSession(db: DbClient, headers: Headers) {
  return readSessionAccess(createDashboardAuth(db), db, headers);
}
