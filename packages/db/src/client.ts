import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getServerEnv } from "@is2u/core/env";
import * as schema from "./schema";

let sqlClient: ReturnType<typeof postgres> | undefined;
let database: PostgresJsDatabase<typeof schema> | undefined;

export function getSqlClient() {
  sqlClient ??= postgres(getServerEnv().DATABASE_URL, { max: 8, idle_timeout: 20, connect_timeout: 10 });
  return sqlClient;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  database ??= drizzle(getSqlClient(), { schema });
  return database;
}

export async function closeDb(): Promise<void> {
  if (sqlClient) await sqlClient.end({ timeout: 5 });
  sqlClient = undefined;
  database = undefined;
}

