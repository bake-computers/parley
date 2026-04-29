import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Database } from "bun:sqlite";
import { count, sql } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { closeDb, connectDb, type DbClient } from "@parley/db/client";
import * as legacySchema from "@parley/db/legacy-d1-schema";
import * as pgSchema from "@parley/db/schema";

const execFileAsync = promisify(execFile);
const D1_DATABASE_NAME = "parley";
const INSERT_CHUNK_SIZE = 250;

type SourceDb = ReturnType<typeof drizzleSqlite<typeof legacySchema>>;

interface ImportPlanEntry {
  name: string;
  sourceTable: unknown;
  targetTable: unknown;
  resetSequence: boolean;
}

const importPlan: ImportPlanEntry[] = [
  {
    name: "players",
    sourceTable: legacySchema.players,
    targetTable: pgSchema.players,
    resetSequence: true,
  },
  {
    name: "stat_snapshots",
    sourceTable: legacySchema.statSnapshots,
    targetTable: pgSchema.statSnapshots,
    resetSequence: true,
  },
  {
    name: "discord_accounts",
    sourceTable: legacySchema.discordAccounts,
    targetTable: pgSchema.discordAccounts,
    resetSequence: true,
  },
  {
    name: "guild_players",
    sourceTable: legacySchema.guildPlayers,
    targetTable: pgSchema.guildPlayers,
    resetSequence: true,
  },
  {
    name: "guild_limits",
    sourceTable: legacySchema.guildLimits,
    targetTable: pgSchema.guildLimits,
    resetSequence: true,
  },
  {
    name: "custom_matches",
    sourceTable: legacySchema.customMatches,
    targetTable: pgSchema.customMatches,
    resetSequence: true,
  },
  {
    name: "custom_match_players",
    sourceTable: legacySchema.customMatchPlayers,
    targetTable: pgSchema.customMatchPlayers,
    resetSequence: true,
  },
  {
    name: "tournaments",
    sourceTable: legacySchema.tournaments,
    targetTable: pgSchema.tournaments,
    resetSequence: true,
  },
  {
    name: "tournament_entries",
    sourceTable: legacySchema.tournamentEntries,
    targetTable: pgSchema.tournamentEntries,
    resetSequence: true,
  },
  {
    name: "tournament_entry_players",
    sourceTable: legacySchema.tournamentEntryPlayers,
    targetTable: pgSchema.tournamentEntryPlayers,
    resetSequence: true,
  },
  {
    name: "tournament_bracket_matches",
    sourceTable: legacySchema.tournamentBracketMatches,
    targetTable: pgSchema.tournamentBracketMatches,
    resetSequence: true,
  },
  {
    name: "matchmaking_queues",
    sourceTable: legacySchema.matchmakingQueues,
    targetTable: pgSchema.matchmakingQueues,
    resetSequence: true,
  },
  {
    name: "matchmaking_queue_players",
    sourceTable: legacySchema.matchmakingQueuePlayers,
    targetTable: pgSchema.matchmakingQueuePlayers,
    resetSequence: true,
  },
];

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return databaseUrl;
}

async function exportD1(sqlPath: string): Promise<void> {
  await execFileAsync("wrangler", [
    "d1",
    "export",
    D1_DATABASE_NAME,
    "--remote",
    "--output",
    sqlPath,
  ]);
}

async function buildSourceDatabase(tempDir: string): Promise<{
  sqlite: Database;
  db: SourceDb;
}> {
  const sqlPath = join(tempDir, "parley-d1.sql");
  const sqlitePath = join(tempDir, "parley-d1.sqlite");
  await exportD1(sqlPath);
  const dump = await readFile(sqlPath, "utf8");
  const sqlite = new Database(sqlitePath, { create: true });
  sqlite.exec(dump);
  return {
    sqlite,
    db: drizzleSqlite(sqlite, { schema: legacySchema }),
  };
}

async function countRows(db: SourceDb | DbClient, table: unknown): Promise<number> {
  const rows = await db.select({ value: count() }).from(table as never);
  return Number(rows[0]?.value ?? 0);
}

async function readAllRows<Row>(db: SourceDb, table: unknown): Promise<Row[]> {
  return (await db.select().from(table as never)) as Row[];
}

async function ensureTargetEmpty(db: DbClient): Promise<void> {
  for (const entry of importPlan) {
    const rowCount = await countRows(db, entry.targetTable);
    if (rowCount > 0) {
      throw new Error(`Target database is not empty: ${entry.name} has ${rowCount} rows.`);
    }
  }
}

async function insertChunked<Row extends Record<string, unknown>>(
  db: DbClient,
  table: unknown,
  rows: Row[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    await db.insert(table as never).values(rows.slice(index, index + INSERT_CHUNK_SIZE) as never);
  }
}

async function resetSequence(db: DbClient, tableName: string, maxId: number): Promise<void> {
  if (maxId <= 0) {
    return;
  }

  await db.execute(
    sql.raw(`select setval(pg_get_serial_sequence('${tableName}', 'id'), ${maxId}, true);`),
  );
}

async function main(): Promise<void> {
  const dryRun = hasFlag("--dry-run");
  const databaseUrl = requireDatabaseUrl();
  const tempDir = await mkdtemp(join(tmpdir(), "parley-d1-"));
  await mkdir(tempDir, { recursive: true });

  const source = await buildSourceDatabase(tempDir);
  const target = await connectDb(databaseUrl);

  try {
    const sourceCounts = new Map<string, number>();
    for (const entry of importPlan) {
      sourceCounts.set(entry.name, await countRows(source.db, entry.sourceTable));
    }

    console.log("Source row counts:");
    for (const entry of importPlan) {
      console.log(`- ${entry.name}: ${sourceCounts.get(entry.name) ?? 0}`);
    }

    if (dryRun) {
      console.log("Dry run complete. No rows written to Postgres.");
      return;
    }

    await ensureTargetEmpty(target.db);

    for (const entry of importPlan) {
      const rows = await readAllRows<Record<string, unknown>>(source.db, entry.sourceTable);
      if (rows.length > 0) {
        await insertChunked(target.db, entry.targetTable, rows);
        if (entry.resetSequence) {
          const maxId = Math.max(...rows.map((row) => Number(row.id ?? 0)));
          await resetSequence(target.db, entry.name, maxId);
        }
      }

      const targetCount = await countRows(target.db, entry.targetTable);
      const sourceCount = sourceCounts.get(entry.name) ?? 0;
      if (targetCount !== sourceCount) {
        throw new Error(
          `Row count mismatch for ${entry.name}: source=${sourceCount}, target=${targetCount}.`,
        );
      }

      console.log(`Imported ${entry.name}: ${targetCount} rows`);
    }

    console.log("Backfill complete.");
  } finally {
    source.sqlite.close();
    await closeDb(target);
  }
}

await main();
