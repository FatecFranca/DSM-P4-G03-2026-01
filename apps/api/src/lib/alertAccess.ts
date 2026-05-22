import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { alerts, emergencyContacts } from "../db/schema.js";

export type AlertRow = typeof alerts.$inferSelect;

export async function getAlertById(alertId: string): Promise<AlertRow | null> {
  const [row] = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);
  return row ?? null;
}

/** Active emergency contact link: contactUserId views ownerUserId's alerts. */
export async function isActiveContactOfOwner(
  contactUserId: string,
  ownerUserId: string,
): Promise<boolean> {
  const [link] = await db
    .select({ id: emergencyContacts.id })
    .from(emergencyContacts)
    .where(
      and(
        eq(emergencyContacts.contactUserId, contactUserId),
        eq(emergencyContacts.ownerUserId, ownerUserId),
        eq(emergencyContacts.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(link);
}

export function canPostLocation(userId: string, alert: AlertRow): boolean {
  return alert.status === "active" && alert.ownerUserId === userId;
}

export async function canReadAlertLocations(
  userId: string,
  alert: AlertRow,
): Promise<boolean> {
  if (alert.ownerUserId === userId) {
    return true;
  }
  return isActiveContactOfOwner(userId, alert.ownerUserId);
}

export async function canAckAlertAsContact(
  userId: string,
  alert: AlertRow,
): Promise<boolean> {
  if (alert.status !== "active" || alert.ownerUserId === userId) {
    return false;
  }
  return isActiveContactOfOwner(userId, alert.ownerUserId);
}
