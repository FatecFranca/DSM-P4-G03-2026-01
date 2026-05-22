import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { normalizeEmail } from "../lib/email.js";
import { db } from "./index.js";
import { users } from "./schema.js";

const SEED_USERS = [
  { name: "Alice Owner", email: "alice@example.com" },
  { name: "Bob Contact", email: "bob@example.com" },
] as const;

async function seed(): Promise<void> {
  const plainPassword = process.env.SEED_PASSWORD ?? "SeedPass123!";
  const passwordHash = bcrypt.hashSync(plainPassword, 12);

  for (const row of SEED_USERS) {
    const email = normalizeEmail(row.email);
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      continue;
    }

    await db.insert(users).values({
      name: row.name,
      email,
      passwordHash,
    });
  }

  console.info(
    "Seed complete. Users (if created) use SEED_PASSWORD or default (see docs).",
  );
}

await seed();
process.exit(0);
