import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import {
  alerts,
  devicePushTokens,
  emergencyContacts,
  pushDeliveryEvents,
  users,
} from "../src/db/schema.js";
import { resolvePushProviderMode } from "../src/config/env.js";

const alertIdArg = process.argv[2];

async function main(): Promise<void> {
  console.log("\n=== push_provider (env) ===");
  console.log({ mode: resolvePushProviderMode() });

  const tokens = await db
    .select({
      userId: devicePushTokens.userId,
      email: users.email,
      platform: devicePushTokens.platform,
      active: devicePushTokens.active,
      tokenPrefix: devicePushTokens.token,
      updatedAt: devicePushTokens.updatedAt,
    })
    .from(devicePushTokens)
    .innerJoin(users, eq(users.id, devicePushTokens.userId))
    .orderBy(desc(devicePushTokens.updatedAt))
    .limit(20);

  console.log("\n=== device_push_tokens ===");
  if (tokens.length === 0) {
    console.log("(vazio) — contato provavelmente não registrou POST /devices/push-token");
  } else {
    for (const t of tokens) {
      console.log({
        email: t.email,
        platform: t.platform,
        active: t.active,
        tokenPrefix: `${t.tokenPrefix.slice(0, 16)}…`,
        updatedAt: t.updatedAt.toISOString(),
      });
    }
  }

  const contacts = await db
    .select({
      ownerEmail: users.email,
      contactUserId: emergencyContacts.contactUserId,
    })
    .from(emergencyContacts)
    .innerJoin(users, eq(users.id, emergencyContacts.ownerUserId))
    .where(eq(emergencyContacts.status, "active"))
    .limit(20);

  // second query for contact emails
  const contactRows = [];
  for (const row of contacts) {
    const [contact] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, row.contactUserId))
      .limit(1);
    contactRows.push({
      ownerEmail: row.ownerEmail,
      contactEmail: contact?.email ?? "?",
    });
  }

  console.log("\n=== emergency_contacts (active) ===");
  console.log(contactRows.length ? contactRows : "(vazio)");

  const activeAlerts = await db
    .select({
      id: alerts.id,
      ownerUserId: alerts.ownerUserId,
      startedAt: alerts.startedAt,
    })
    .from(alerts)
    .where(eq(alerts.status, "active"))
    .orderBy(desc(alerts.startedAt))
    .limit(5);

  console.log("\n=== alerts ativos ===");
  console.log(activeAlerts.length ? activeAlerts : "(nenhum)");

  const deliveries = alertIdArg
    ? await db
        .select({
          alertId: pushDeliveryEvents.alertId,
          email: users.email,
          kind: pushDeliveryEvents.kind,
          success: pushDeliveryEvents.success,
          errorCode: pushDeliveryEvents.errorCode,
          providerMessageId: pushDeliveryEvents.providerMessageId,
          createdAt: pushDeliveryEvents.createdAt,
        })
        .from(pushDeliveryEvents)
        .innerJoin(users, eq(users.id, pushDeliveryEvents.recipientUserId))
        .where(eq(pushDeliveryEvents.alertId, alertIdArg))
        .orderBy(desc(pushDeliveryEvents.createdAt))
        .limit(20)
    : await db
        .select({
          alertId: pushDeliveryEvents.alertId,
          email: users.email,
          kind: pushDeliveryEvents.kind,
          success: pushDeliveryEvents.success,
          errorCode: pushDeliveryEvents.errorCode,
          providerMessageId: pushDeliveryEvents.providerMessageId,
          createdAt: pushDeliveryEvents.createdAt,
        })
        .from(pushDeliveryEvents)
        .innerJoin(users, eq(users.id, pushDeliveryEvents.recipientUserId))
        .orderBy(desc(pushDeliveryEvents.createdAt))
        .limit(15);

  console.log("\n=== push_delivery_events ===");
  console.log(deliveries.length ? deliveries : "(nenhum envio registrado)");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
