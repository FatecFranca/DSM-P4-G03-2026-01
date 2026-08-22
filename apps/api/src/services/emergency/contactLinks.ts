import { and, eq, gt } from "drizzle-orm";
import { db } from "../../db/index.js";
import { emergencyContacts, invites, users } from "../../db/schema.js";
import { normalizeEmail } from "../../lib/email.js";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function isPgUniqueViolation(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null
      ? ((error as { code?: string }).code ??
        (error as { cause?: { code?: string } }).cause?.code)
      : undefined;
  return code === "23505";
}

export async function activateEmergencyContactLink(
  tx: Tx,
  ownerUserId: string,
  contactUserId: string,
): Promise<void> {
  if (ownerUserId === contactUserId) {
    throw new Error("SELF_LINK");
  }

  await tx.insert(emergencyContacts).values({
    ownerUserId,
    contactUserId,
    status: "active",
  });
}

export async function acceptInviteRecord(
  tx: Tx,
  inviteId: string,
  ownerUserId: string,
  contactUserId: string,
): Promise<void> {
  await tx
    .update(invites)
    .set({ status: "accepted" })
    .where(eq(invites.id, inviteId));

  await activateEmergencyContactLink(tx, ownerUserId, contactUserId);
}

/** Accepts all non-expired pending invites addressed to the user's email. */
export async function acceptPendingInvitesForUser(
  userId: string,
): Promise<number> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return 0;
  }

  const email = normalizeEmail(user.email);
  const now = new Date();

  const pendingRows = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.targetEmail, email),
        eq(invites.status, "pending"),
        gt(invites.expiresAt, now),
      ),
    );

  let accepted = 0;

  for (const invite of pendingRows) {
    if (invite.ownerUserId === userId) {
      await db
        .update(invites)
        .set({ status: "revoked" })
        .where(eq(invites.id, invite.id));
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        await acceptInviteRecord(tx, invite.id, invite.ownerUserId, userId);
      });
      accepted += 1;
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        await db
          .update(invites)
          .set({ status: "accepted" })
          .where(eq(invites.id, invite.id));
        accepted += 1;
        continue;
      }
      throw error;
    }
  }

  return accepted;
}
