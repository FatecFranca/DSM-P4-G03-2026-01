import { and, eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { db } from "../db/index.js";
import {
  alertAcknowledgments,
  alertAuditEvents,
  alerts,
  emergencyContacts,
} from "../db/schema.js";
import { logAlertTelemetry } from "../lib/telemetry.js";
import type { AlertEscalationNotifier } from "../services/alertNotifications/types.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_FIRST_NO_ACK_MINUTES = 5;
const DEFAULT_REPEAT_MINUTES = 5;

function readMinutesEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return n;
}

function readIntervalMs(): number {
  const raw = process.env.ALERT_ESCALATION_INTERVAL_MS;
  if (raw === undefined || raw === "") {
    return DEFAULT_INTERVAL_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 5_000) {
    return DEFAULT_INTERVAL_MS;
  }
  return n;
}

export async function runAlertEscalationTick(
  log: FastifyBaseLogger,
  notifier: AlertEscalationNotifier,
): Promise<void> {
  const now = Date.now();
  const firstMs =
    readMinutesEnv(
      "ALERT_ESCALATION_NO_ACK_MINUTES",
      DEFAULT_FIRST_NO_ACK_MINUTES,
    ) * 60_000;
  const repeatMs =
    readMinutesEnv("ALERT_ESCALATION_REPEAT_MINUTES", DEFAULT_REPEAT_MINUTES) *
    60_000;
  const firstCutoff = now - firstMs;
  const repeatCutoff = now - repeatMs;

  const activeRows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.status, "active"));

  if (activeRows.length === 0) {
    return;
  }

  const ackRows = await db
    .select({ alertId: alertAcknowledgments.alertId })
    .from(alertAcknowledgments);
  const acked = new Set(ackRows.map((r) => r.alertId));

  for (const alert of activeRows) {
    if (acked.has(alert.id)) {
      continue;
    }

    const dueFirst =
      alert.lastEscalationAt === null &&
      alert.startedAt.getTime() <= firstCutoff;
    const dueRepeat =
      alert.lastEscalationAt !== null &&
      alert.lastEscalationAt.getTime() <= repeatCutoff;

    if (!dueFirst && !dueRepeat) {
      continue;
    }

    const previousRisk = alert.riskLevel;
    const nextCount = alert.escalationCount + 1;
    const nextRisk = "high" as const;
    const at = new Date();

    const contactRows = await db
      .select({ id: emergencyContacts.contactUserId })
      .from(emergencyContacts)
      .where(
        and(
          eq(emergencyContacts.ownerUserId, alert.ownerUserId),
          eq(emergencyContacts.status, "active"),
        ),
      );

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(alerts)
          .set({
            lastEscalationAt: at,
            escalationCount: nextCount,
            riskLevel: nextRisk,
          })
          .where(eq(alerts.id, alert.id));

        await tx.insert(alertAuditEvents).values({
          alertId: alert.id,
          actorUserId: alert.ownerUserId,
          event: "escalated",
          payload: {
            escalationCount: nextCount,
            previousRiskLevel: previousRisk,
            riskLevel: nextRisk,
            activeContactCount: contactRows.length,
          },
        });
      });
    } catch (err) {
      log.error({ err, alertId: alert.id }, "alert_escalation_tx_failed");
      continue;
    }

    logAlertTelemetry(log, "alert_escalated", { alertId: alert.id });

    await notifier.notifyEscalation({
      alertId: alert.id,
      escalationCount: nextCount,
      activeContactCount: contactRows.length,
    });
  }
}

export function startAlertEscalationScheduler(
  log: FastifyBaseLogger,
  notifier: AlertEscalationNotifier,
): () => void {
  const intervalMs = readIntervalMs();
  const id = setInterval(() => {
    void runAlertEscalationTick(log, notifier).catch((err) => {
      log.error({ err }, "alert_escalation_tick_failed");
    });
  }, intervalMs);
  return () => clearInterval(id);
}
