import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "./client";

await migrate(getDb(), { migrationsFolder: "packages/db/migrations" });
await closeDb();

