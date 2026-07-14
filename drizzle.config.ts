import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://is2u:is2u@localhost:5432/is2u",
  },
  strict: true,
  verbose: true,
});

