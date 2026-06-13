/**
 * Descobre a connection string do Supavisor que funciona para este project ref.
 * Uso (na raiz do monorepo ou em apps/api):
 *   node scripts/find-supabase-pooler.mjs
 * Lê SUPABASE_DB_PASSWORD e opcional SUPABASE_PROJECT_REF do ambiente,
 * ou extrai de DATABASE_URL no .env via dotenv não usado — passe env vars:
 *   SUPABASE_PROJECT_REF=kusoyirvvwcqoyqeytcp SUPABASE_DB_PASSWORD=... node scripts/find-supabase-pooler.mjs
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

function loadEnv() {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i === -1) continue;
      const key = trimmed.slice(0, i);
      let val = trimmed.slice(i + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const ref =
  process.env.SUPABASE_PROJECT_REF ??
  process.env.DATABASE_URL?.match(/postgres\.([a-z0-9]+)/)?.[1] ??
  process.env.DATABASE_URL?.match(/db\.([a-z0-9]+)\.supabase\.co/)?.[1];

const password =
  process.env.SUPABASE_DB_PASSWORD ??
  process.env.DATABASE_URL?.match(/postgres(?:\.[a-z0-9]+)?:([^@]+)@/)?.[1];

if (!ref || !password) {
  console.error(
    "Defina SUPABASE_PROJECT_REF e SUPABASE_DB_PASSWORD, ou DATABASE_URL no apps/api/.env",
  );
  process.exit(1);
}

const regions = [
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-southeast-1",
  "ap-northeast-1",
  "ap-south-1",
];
const prefixes = ["aws-0", "aws-1"];

async function probe(label, url, options = {}) {
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 8,
    idle_timeout: 1,
    ...options,
  });
  try {
    await sql`select 1 as ok`;
    await sql.end({ timeout: 2 });
    return { ok: true, label, url };
  } catch (err) {
    try {
      await sql.end({ timeout: 2 });
    } catch {
      /* ignore */
    }
    return { ok: false, label, error: err.message };
  }
}

const attempts = [];
for (const prefix of prefixes) {
  for (const region of regions) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    attempts.push(
      probe(
        `session ${host}:5432`,
        `postgresql://postgres.${ref}:${password}@${host}:5432/postgres`,
      ),
    );
    attempts.push(
      probe(
        `transaction ${host}:6543`,
        `postgresql://postgres.${ref}:${password}@${host}:6543/postgres`,
        { prepare: false },
      ),
    );
    attempts.push(
      probe(
        `session+options ${host}:5432`,
        `postgresql://postgres:${password}@${host}:5432/postgres?options=reference%3D${ref}`,
      ),
    );
  }
}

const results = await Promise.all(attempts);
const winners = results.filter((r) => r.ok);

if (winners.length === 0) {
  console.error("Nenhum pooler respondeu. Erros de amostra:");
  for (const r of results.filter((r) => r.error && !/ENOTFOUND|timeout|ECONNREFUSED/i.test(r.error)).slice(0, 5)) {
    console.error(`- ${r.label}: ${r.error}`);
  }
  process.exit(1);
}

console.log("Connection strings que funcionaram:\n");
for (const w of winners) {
  console.log(`# ${w.label}`);
  console.log(`DATABASE_URL=${w.url}\n`);
}
