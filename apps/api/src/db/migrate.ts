import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "../../drizzle");

const migrationClient = postgres(connectionString, { max: 1 });
const db = drizzle(migrationClient);

await migrate(db, { migrationsFolder });
await migrationClient.end({ timeout: 5 });
