import {
  AckAlertParamsSchema,
  AckAlertResponseSchema,
  ActiveAlertResponseSchema,
  AlertLocationPointSchema,
  CancelAlertParamsSchema,
  CancelAlertRequestSchema,
  CancelAlertResponseSchema,
  ContactsAlertFeedResponseSchema,
  ListAlertLocationsParamsSchema,
  ListAlertLocationsQuerySchema,
  ListAlertLocationsResponseSchema,
  PostAlertLocationParamsSchema,
  PostAlertLocationRequestSchema,
  PostAlertLocationResponseSchema,
  StartAlertRequestSchema,
  StartAlertResponseSchema,
} from "@protecther/contracts";
import { and, asc, eq, gt, max, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  alertAcknowledgments,
  alertAuditEvents,
  alertLocations,
  alerts,
  emergencyContacts,
  users,
} from "../db/schema.js";
import {
  canAckAlertAsContact,
  canPostLocation,
  canReadAlertLocations,
  getAlertById,
} from "../lib/alertAccess.js";
import { apiError } from "../lib/httpErrors.js";
import { toAlertPublic, toUserPublic } from "../lib/mappers.js";
import { logAlertTelemetry } from "../lib/telemetry.js";
import type { AlertContactsPushNotifier } from "../services/alertNotifications/types.js";

function getUserId(request: { user?: { sub?: string } }): string | undefined {
  return request.user?.sub;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const direct = (error as { code?: string }).code;
  if (direct === "23505") {
    return true;
  }
  const cause = (error as { cause?: { code?: string } }).cause?.code;
  return cause === "23505";
}

function isDuressCancel(pin: string | undefined): boolean {
  return typeof pin === "string" && pin.trim().length > 0;
}

const LOCATION_INGEST_MAX_PER_MINUTE = Number(
  process.env.ALERT_LOCATION_RATE_MAX_PER_MINUTE ?? 90,
);

const CAPTURE_REGRESSION_MS = Number(
  process.env.ALERT_LOCATION_CAPTURE_REGRESSION_MS ?? 180_000,
);

function toLocationPoint(row: typeof alertLocations.$inferSelect) {
  return AlertLocationPointSchema.parse({
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy ?? null,
    speed: row.speed ?? null,
    heading: row.heading ?? null,
    capturedAt: row.capturedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

function parseIsoMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export async function registerAlertRoutes(
  app: FastifyInstance,
  deps: { contactsPush: AlertContactsPushNotifier },
): Promise<void> {
  /** Static paths first; param routes last (avoid `:id` shadowing). */
  app.post("/alerts/start", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const parsed = StartAlertRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", parsed.error.message));
    }

    const mode = parsed.data.mode;

    try {
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(alerts)
          .values({
            ownerUserId: userId,
            status: "active",
            mode,
            riskLevel: "normal",
          })
          .returning();

        if (!row) {
          return null;
        }

        await tx.insert(alertAuditEvents).values({
          alertId: row.id,
          actorUserId: userId,
          event: "started",
          payload: { mode },
        });

        return row;
      });

      if (!result) {
        return reply
          .status(500)
          .send(apiError("INSERT_FAILED", "Could not create alert"));
      }

      logAlertTelemetry(request.log, "alert_started", {
        alertId: result.id,
      });

      void deps.contactsPush.notifyAlertStarted(result.id).catch((err) => {
        request.log.error(
          { err, alertId: result.id },
          "notify_alert_started_failed",
        );
      });

      const body = StartAlertResponseSchema.parse({
        alert: toAlertPublic(result),
      });
      return reply.status(201).send(body);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply
          .status(409)
          .send(
            apiError(
              "ALERT_ALREADY_ACTIVE",
              "You already have an active alert",
            ),
          );
      }
      request.log.error({ err: error }, "alert_start_failed");
      return reply
        .status(500)
        .send(apiError("INTERNAL_ERROR", "Unexpected error"));
    }
  });

  app.get("/alerts/active", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const [row] = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.ownerUserId, userId), eq(alerts.status, "active")))
      .limit(1);

    const body = ActiveAlertResponseSchema.parse({
      alert: row ? toAlertPublic(row) : null,
    });
    return reply.send(body);
  });

  app.get("/alerts/contacts-feed", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    logAlertTelemetry(request.log, "alert_feed_viewed");

    const rows = await db
      .select({
        alert: alerts,
        ownerUser: users,
      })
      .from(emergencyContacts)
      .innerJoin(
        alerts,
        and(
          eq(alerts.ownerUserId, emergencyContacts.ownerUserId),
          eq(alerts.status, "active"),
        ),
      )
      .innerJoin(users, eq(users.id, emergencyContacts.ownerUserId))
      .where(
        and(
          eq(emergencyContacts.contactUserId, userId),
          eq(emergencyContacts.status, "active"),
        ),
      );

    const items = rows.map((r) => ({
      owner: toUserPublic(r.ownerUser),
      alert: {
        id: r.alert.id,
        status: r.alert.status,
        mode: r.alert.mode,
        riskLevel: r.alert.riskLevel,
        startedAt: r.alert.startedAt.toISOString(),
        createdAt: r.alert.createdAt.toISOString(),
      },
    }));

    const body = ContactsAlertFeedResponseSchema.parse({ items });
    return reply.send(body);
  });

  app.post(
    "/alerts/:id/location",
    {
      config: {
        rateLimit: {
          max: LOCATION_INGEST_MAX_PER_MINUTE,
          timeWindow: "1 minute",
          keyGenerator: (request) => {
            const sub = (request.user as { sub?: string } | undefined)?.sub;
            return sub ? `alert_loc:${sub}` : request.ip;
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) {
        return reply
          .status(401)
          .send(apiError("UNAUTHORIZED", "Missing authentication"));
      }

      const params = PostAlertLocationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply
          .status(400)
          .send(apiError("VALIDATION_ERROR", params.error.message));
      }

      const bodyParsed = PostAlertLocationRequestSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply
          .status(400)
          .send(apiError("VALIDATION_ERROR", bodyParsed.error.message));
      }

      const alertId = params.data.id;
      const alert = await getAlertById(alertId);
      if (!alert || !canPostLocation(userId, alert)) {
        return reply
          .status(404)
          .send(apiError("ALERT_NOT_FOUND", "Alert not found"));
      }

      const capturedMs = parseIsoMs(bodyParsed.data.capturedAt);
      if (capturedMs === null) {
        return reply
          .status(400)
          .send(apiError("VALIDATION_ERROR", "Invalid capturedAt"));
      }

      const now = Date.now();
      const skewMs = 120_000;
      if (capturedMs > now + skewMs) {
        return reply
          .status(400)
          .send(
            apiError(
              "VALIDATION_ERROR",
              "capturedAt cannot be far in the future",
            ),
          );
      }
      if (capturedMs < alert.startedAt.getTime() - skewMs) {
        logAlertTelemetry(request.log, "location_ingest_rejected", {
          alertId,
          reason: "before_alert_start",
        });
        return reply
          .status(400)
          .send(
            apiError(
              "VALIDATION_ERROR",
              "capturedAt cannot be before alert started",
            ),
          );
      }

      const [lastCap] = await db
        .select({ last: max(alertLocations.capturedAt) })
        .from(alertLocations)
        .where(eq(alertLocations.alertId, alertId));

      if (
        lastCap?.last &&
        capturedMs < lastCap.last.getTime() - CAPTURE_REGRESSION_MS
      ) {
        logAlertTelemetry(request.log, "location_ingest_rejected", {
          alertId,
          reason: "captured_at_regression",
        });
        return reply
          .status(400)
          .send(
            apiError(
              "VALIDATION_ERROR",
              "capturedAt regressed beyond allowed window for this alert",
            ),
          );
      }

      const [countRow] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(alertLocations)
        .where(eq(alertLocations.alertId, alertId));

      const priorCount = Number(countRow?.n ?? 0);

      let inserted: typeof alertLocations.$inferSelect | undefined;
      try {
        const [row] = await db
          .insert(alertLocations)
          .values({
            alertId,
            lat: bodyParsed.data.lat,
            lng: bodyParsed.data.lng,
            accuracy: bodyParsed.data.accuracy ?? null,
            speed: bodyParsed.data.speed ?? null,
            heading: bodyParsed.data.heading ?? null,
            capturedAt: new Date(capturedMs),
          })
          .returning();
        inserted = row;
      } catch (err) {
        request.log.error({ err, alertId }, "location_insert_failed");
        logAlertTelemetry(request.log, "location_post_failed", { alertId });
        return reply
          .status(500)
          .send(apiError("INSERT_FAILED", "Could not store location"));
      }

      if (!inserted) {
        logAlertTelemetry(request.log, "location_post_failed", { alertId });
        return reply
          .status(500)
          .send(apiError("INSERT_FAILED", "Could not store location"));
      }

      if (priorCount === 0) {
        const ms = Date.now() - alert.startedAt.getTime();
        logAlertTelemetry(request.log, "first_location_ingest_ms", {
          alertId,
          ms,
        });
      }

      logAlertTelemetry(request.log, "location_point_sent", { alertId });

      const responseBody = PostAlertLocationResponseSchema.parse({
        point: toLocationPoint(inserted),
      });
      return reply.status(201).send(responseBody);
    },
  );

  app.get("/alerts/:id/locations", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const params = ListAlertLocationsParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", params.error.message));
    }

    const query = ListAlertLocationsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", query.error.message));
    }

    const alertId = params.data.id;
    const alert = await getAlertById(alertId);
    if (!alert) {
      return reply
        .status(404)
        .send(apiError("ALERT_NOT_FOUND", "Alert not found"));
    }

    const allowed = await canReadAlertLocations(userId, alert);
    if (!allowed) {
      return reply
        .status(403)
        .send(apiError("FORBIDDEN", "Not allowed to read this alert"));
    }

    const sinceRaw = query.data.since;
    const sinceDate =
      sinceRaw !== undefined ? new Date(sinceRaw) : alert.startedAt;
    if (Number.isNaN(sinceDate.getTime())) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", "Invalid since"));
    }

    const rows = await db
      .select()
      .from(alertLocations)
      .where(
        and(
          eq(alertLocations.alertId, alertId),
          gt(alertLocations.capturedAt, sinceDate),
        ),
      )
      .orderBy(asc(alertLocations.capturedAt))
      .limit(500);

    const responseBody = ListAlertLocationsResponseSchema.parse({
      points: rows.map(toLocationPoint),
    });
    return reply.send(responseBody);
  });

  app.post("/alerts/:id/ack", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const params = AckAlertParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", params.error.message));
    }

    const alertId = params.data.id;
    const alert = await getAlertById(alertId);
    if (!alert) {
      return reply
        .status(404)
        .send(apiError("ALERT_NOT_FOUND", "Alert not found"));
    }

    const canAck = await canAckAlertAsContact(userId, alert);
    if (!canAck) {
      return reply
        .status(403)
        .send(apiError("FORBIDDEN", "Only an active contact can acknowledge"));
    }

    const [existing] = await db
      .select()
      .from(alertAcknowledgments)
      .where(
        and(
          eq(alertAcknowledgments.alertId, alertId),
          eq(alertAcknowledgments.contactUserId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      const body = AckAlertResponseSchema.parse({
        acknowledgedAt: existing.acknowledgedAt.toISOString(),
      });
      return reply.send(body);
    }

    try {
      const row = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(alertAcknowledgments)
          .values({
            alertId,
            contactUserId: userId,
          })
          .returning();
        return inserted;
      });

      if (!row) {
        return reply
          .status(500)
          .send(apiError("INSERT_FAILED", "Could not record acknowledgment"));
      }

      logAlertTelemetry(request.log, "alert_acknowledged", { alertId });

      const body = AckAlertResponseSchema.parse({
        acknowledgedAt: row.acknowledgedAt.toISOString(),
      });
      return reply.status(201).send(body);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const [again] = await db
          .select()
          .from(alertAcknowledgments)
          .where(
            and(
              eq(alertAcknowledgments.alertId, alertId),
              eq(alertAcknowledgments.contactUserId, userId),
            ),
          )
          .limit(1);
        if (again) {
          const body = AckAlertResponseSchema.parse({
            acknowledgedAt: again.acknowledgedAt.toISOString(),
          });
          return reply.send(body);
        }
      }
      request.log.error({ err: error }, "alert_ack_failed");
      return reply
        .status(500)
        .send(apiError("INTERNAL_ERROR", "Unexpected error"));
    }
  });

  app.post("/alerts/:id/cancel", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const params = CancelAlertParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", params.error.message));
    }

    const bodyParsed = CancelAlertRequestSchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", bodyParsed.error.message));
    }

    const alertId = params.data.id;
    const duress = isDuressCancel(bodyParsed.data.pin);

    logAlertTelemetry(request.log, "alert_cancel_requested", { alertId });

    const [row] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, alertId))
      .limit(1);

    if (!row || row.ownerUserId !== userId) {
      return reply
        .status(404)
        .send(apiError("ALERT_NOT_FOUND", "Alert not found"));
    }

    if (row.status !== "active") {
      return reply
        .status(409)
        .send(apiError("ALERT_NOT_ACTIVE", "This alert is no longer active"));
    }

    const endedAt = new Date();
    const riskLevel = duress ? "high" : row.riskLevel;
    const cancelReason = duress ? "duress" : null;
    const auditEvent = duress ? "cancelled_duress" : "cancelled";

    if (duress) {
      logAlertTelemetry(request.log, "alert_cancel_duress", { alertId });
    }

    const [updated] = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(alerts)
        .set({
          status: "closed",
          endedAt,
          riskLevel,
          cancelReason,
        })
        .where(eq(alerts.id, alertId))
        .returning();

      if (u) {
        await tx.insert(alertAuditEvents).values({
          alertId,
          actorUserId: userId,
          event: auditEvent,
          payload: { previousRiskLevel: row.riskLevel, riskLevel },
        });
      }

      return [u];
    });

    if (!updated) {
      return reply
        .status(500)
        .send(apiError("UPDATE_FAILED", "Could not cancel alert"));
    }

    const responseBody = CancelAlertResponseSchema.parse({
      alert: toAlertPublic(updated),
    });
    return reply.send(responseBody);
  });
}
