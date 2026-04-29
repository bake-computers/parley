import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, type ClientConfig } from "pg";
import * as schema from "./schema";

export type DbClient = NodePgDatabase<typeof schema>;

export interface DbConnection {
  client: Client;
  db: DbClient;
}

export function normalizePgConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  if (url.searchParams.get("sslrootcert") === "system") {
    url.searchParams.delete("sslrootcert");
  }

  return url.toString();
}

export function toPgClientConfig(connectionString: string): ClientConfig {
  const normalizedConnectionString = normalizePgConnectionString(connectionString);
  const url = new URL(normalizedConnectionString);
  const sslMode = url.searchParams.get("sslmode");

  const config: ClientConfig = {
    connectionString: normalizedConnectionString,
  };

  if (sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full") {
    config.ssl = {
      rejectUnauthorized: sslMode !== "require",
    };
  }

  return config;
}

export async function connectDb(connectionString: string): Promise<DbConnection> {
  const client = new Client(toPgClientConfig(connectionString));
  await client.connect();
  return {
    client,
    db: drizzle(client, { schema }),
  };
}

export async function closeDb(connection: DbConnection | null | undefined): Promise<void> {
  if (!connection) {
    return;
  }

  await connection.client.end();
}
