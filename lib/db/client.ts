import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// node-postgres speaks plain Postgres wire protocol, so this connects to
// local Postgres in development and to Neon in production via the same
// DATABASE_URL — no driver swap needed.
const pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });

export const db = drizzle(pool, { schema });
