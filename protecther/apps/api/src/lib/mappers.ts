import { AlertPublicSchema, UserPublicSchema } from "@protecther/contracts";
import type { InferSelectModel } from "drizzle-orm";
import type { alerts, users } from "../db/schema.js";

type UserRow = InferSelectModel<typeof users>;
type AlertRow = InferSelectModel<typeof alerts>;

export function toUserPublic(row: UserRow) {
  return UserPublicSchema.parse({
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  });
}

export function toAlertPublic(row: AlertRow) {
  return AlertPublicSchema.parse({
    id: row.id,
    ownerUserId: row.ownerUserId,
    status: row.status,
    mode: row.mode,
    riskLevel: row.riskLevel,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    cancelReason: row.cancelReason ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}
