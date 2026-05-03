import { env } from "cloudflare:workers";
import { closeDb, connectDb, type DbClient } from "@parley/db/client";

function toErrorSummary(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return String(error);
}

export async function withDb<T>(callback: (db: DbClient) => Promise<T>): Promise<T> {
  try {
    if (!env.HYPERDRIVE) {
      throw new Error("HYPERDRIVE binding not available");
    }

    const connection = await connectDb(env.HYPERDRIVE.connectionString);
    try {
      return await callback(connection.db);
    } finally {
      await closeDb(connection);
    }
  } catch (error) {
    console.error("Database connection error", {
      message: toErrorSummary(error),
    });
    throw error;
  }
}
