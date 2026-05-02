import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DiscordRestClient } from "@parley/discord-runtime";

export interface LoadedEnvFiles {
  loadedFiles: string[];
  workerDir: string;
  repoRoot: string;
}

interface CurrentApplicationPayload {
  id?: string;
  verify_key?: string;
}

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function serializeEnvValue(value: string): string {
  return JSON.stringify(value);
}

async function readEnvFile(filepath: string): Promise<Record<string, string> | null> {
  let contents: string;
  try {
    contents = await readFile(filepath, "utf8");
  } catch {
    return null;
  }

  const parsed: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length) : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const value = normalizedLine.slice(separatorIndex + 1);
    if (key.length === 0) {
      continue;
    }

    parsed[key] = parseEnvValue(value);
  }

  return parsed;
}

async function loadEnvFile(filepath: string): Promise<boolean> {
  const parsed = await readEnvFile(filepath);
  if (!parsed) {
    return false;
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

export function resolveWorkerPaths(sourceImportMetaUrl: string): {
  workerDir: string;
  repoRoot: string;
} {
  const sourceFile = fileURLToPath(sourceImportMetaUrl);
  const workerDir = resolve(dirname(sourceFile), "..");
  return {
    workerDir,
    repoRoot: resolve(workerDir, "..", ".."),
  };
}

export async function loadLocalEnvFiles(sourceImportMetaUrl: string): Promise<LoadedEnvFiles> {
  const { workerDir, repoRoot } = resolveWorkerPaths(sourceImportMetaUrl);
  const candidates = [
    resolve(workerDir, ".dev.vars"),
    resolve(workerDir, ".env.local"),
    resolve(workerDir, ".env"),
    resolve(repoRoot, ".env.local"),
    resolve(repoRoot, ".env"),
  ];
  const loadedFiles: string[] = [];

  for (const candidate of candidates) {
    if (await loadEnvFile(candidate)) {
      loadedFiles.push(candidate);
    }
  }

  return { loadedFiles, workerDir, repoRoot };
}

export function resolveDiscordToken(): string | undefined {
  return process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN;
}

export async function hydrateDiscordApplicationEnvFromApi(): Promise<{
  loadedFromApi: boolean;
}> {
  const token = resolveDiscordToken();
  const needsApplicationId = !process.env.DISCORD_APPLICATION_ID;
  const needsPublicKey = !process.env.DISCORD_PUBLIC_KEY;

  if (!token || (!needsApplicationId && !needsPublicKey)) {
    return { loadedFromApi: false };
  }

  const rest = new DiscordRestClient(token);
  const result = await rest.request<CurrentApplicationPayload>("GET", "/applications/@me");
  if (result.isErr()) {
    return { loadedFromApi: false };
  }

  if (needsApplicationId && typeof result.value.id === "string" && result.value.id.length > 0) {
    process.env.DISCORD_APPLICATION_ID = result.value.id;
  }
  if (
    needsPublicKey &&
    typeof result.value.verify_key === "string" &&
    result.value.verify_key.length > 0
  ) {
    process.env.DISCORD_PUBLIC_KEY = result.value.verify_key;
  }

  return { loadedFromApi: true };
}

export function collectDiscordEnvForWorker(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of [
    "AUTH_COOKIE_DOMAIN",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "DISCORD_PUBLIC_KEY",
    "DISCORD_APPLICATION_ID",
    "DISCORD_BOT_TOKEN",
    "DISCORD_TOKEN",
    "DISCORD_BOT_OWNER_ID",
    "DISCORD_OAUTH_CLIENT_ID",
    "DISCORD_OAUTH_CLIENT_SECRET",
  ]) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      values[key] = value;
    }
  }
  return values;
}

export async function writeWorkerDevVars(
  workerDir: string,
  values: Record<string, string>,
): Promise<string> {
  const targetPath = resolve(workerDir, ".dev.vars");
  const existing = (await readEnvFile(targetPath)) ?? {};
  const merged = {
    ...existing,
    ...values,
  };
  const lines = Object.entries(merged)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${serializeEnvValue(value)}`);
  await writeFile(targetPath, `${lines.join("\n")}\n`, "utf8");
  return targetPath;
}

export function findMissingDiscordEnv(input: {
  requirePublicKey: boolean;
  requireApplicationId: boolean;
  requireToken: boolean;
}): string[] {
  const missing: string[] = [];
  if (input.requirePublicKey && !process.env.DISCORD_PUBLIC_KEY) {
    missing.push("DISCORD_PUBLIC_KEY");
  }
  if (input.requireApplicationId && !process.env.DISCORD_APPLICATION_ID) {
    missing.push("DISCORD_APPLICATION_ID");
  }
  if (input.requireToken && !resolveDiscordToken()) {
    missing.push("DISCORD_BOT_TOKEN or DISCORD_TOKEN");
  }
  return missing;
}
