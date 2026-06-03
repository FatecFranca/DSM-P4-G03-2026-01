import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/**
 * Marks the latest migration as applied when the DB schema already exists
 * but drizzle.__drizzle_migrations was never populated (e.g. after db:push).
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "../../drizzle");
const journalPath = path.join(migrationsFolder, "meta/_journal.json");

type Journal = {
  entries: { tag: string; when: number }[];
};

const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as Journal;
if (!journal.entries.length) {
  throw new Error("No migrations in journal");
}

const latest = journal.entries.reduce((a, b) => (a.when >= b.when ? a : b));
const sqlPath = path.join(migrationsFolder, `${latest.tag}.sql`);
const query = fs.readFileSync(sqlPath, "utf8");
const hash = crypto.createHash("sha256").update(query).digest("hex");

const sql = postgres(connectionString, { max: 1 });

try {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const existing = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations
  `;
  const count = Number(existing[0]?.count ?? 0);
  if (count > 0) {
    console.log(
      `drizzle.__drizzle_migrations already has ${count} row(s); nothing to do.`,
    );
    process.exit(0);
  }

  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${latest.when})
  `;

  console.log(
    `Baselined migration ${latest.tag} (created_at=${latest.when}). Run db:migrate to verify.`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
