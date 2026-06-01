import { and, eq, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { db } from "../../db/index.js";
import {
  devicePushTokens,
  emergencyContacts,
  pushDeliveryEvents,
} from "../../db/schema.js";
import { getAlertById } from "../../lib/alertAccess.js";
import { logAlertTelemetry } from "../../lib/telemetry.js";
import type { PushProvider } from "../push/types.js";
import type {
  AlertContactsPushNotifier,
  AlertEscalationNotifyPayload,
} from "./types.js";

export function createAlertContactsPushOrchestrator(
  log: FastifyBaseLogger,
  provider: PushProvider,
): AlertContactsPushNotifier {
  return {
    async notifyAlertStarted(alertId: string): Promise<void> {
      await deliverToActiveContacts(
        log,
        provider,
        alertId,
        "alert_started",
        "normal",
      );
    },

    async notifyEscalation(
      payload: AlertEscalationNotifyPayload,
    ): Promise<void> {
      await deliverToActiveContacts(
        log,
        provider,
        payload.alertId,
        "escalation",
        "high",
      );
    },
  };
}

async function deliverToActiveContacts(
  log: FastifyBaseLogger,
  provider: PushProvider,
  alertId: string,
  kind: "alert_started" | "escalation",
  priority: "normal" | "high",
): Promise<void> {
  const alert = await getAlertById(alertId);
  if (!alert || alert.status !== "active") {
    return;
  }

  const contacts = await db
    .select({ contactUserId: emergencyContacts.contactUserId })
    .from(emergencyContacts)
    .where(
      and(
        eq(emergencyContacts.ownerUserId, alert.ownerUserId),
        eq(emergencyContacts.status, "active"),
      ),
    );

  if (contacts.length === 0) {
    log.info({ alertId, kind }, "push_skipped_no_contacts");
    return;
  }

  const contactIds = contacts.map((c) => c.contactUserId);
  const tokenRows = await db
    .select({
      userId: devicePushTokens.userId,
      token: devicePushTokens.token,
    })
    .from(devicePushTokens)
    .where(
      and(
        inArray(devicePushTokens.userId, contactIds),
        eq(devicePushTokens.active, true),
      ),
    );

  if (tokenRows.length === 0) {
    logAlertTelemetry(log, "push_skipped_no_tokens", { alertId });
    return;
  }

  const title = "ProtectHer";
  const body =
    kind === "escalation"
      ? "Alerta escalonado. Abra o app e confirme recebimento (ACK)."
      : "Uma titular iniciou um alerta. Abra o app para ver detalhes.";

  const messages = tokenRows.map((t) => ({
    token: t.token,
    title,
    body,
    data: {
      alertId,
      kind,
    },
    androidPriority:
      priority === "high" ? ("high" as const) : ("normal" as const),
  }));

  let results: Awaited<ReturnType<PushProvider["sendBatch"]>>;
  try {
    results = await provider.sendBatch(messages);
  } catch (err) {
    log.error({ err, alertId, kind }, "push_batch_failed");
    for (const t of tokenRows) {
      await db.insert(pushDeliveryEvents).values({
        alertId,
        recipientUserId: t.userId,
        kind,
        priority,
        success: false,
        errorCode: "BATCH_EXCEPTION",
        providerMessageId: null,
      });
      logAlertTelemetry(log, "push_failed", { alertId });
    }
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const row = tokenRows[i];
    if (!r || !row) {
      continue;
    }
    await db.insert(pushDeliveryEvents).values({
      alertId,
      recipientUserId: row.userId,
      kind,
      priority,
      success: r.ok,
      errorCode: r.ok ? null : (r.errorCode ?? "UNKNOWN"),
      providerMessageId: r.messageId ?? null,
    });
    if (r.ok) {
      logAlertTelemetry(log, "push_sent", { alertId });
    } else {
      logAlertTelemetry(log, "push_failed", { alertId });
    }
  }
}
