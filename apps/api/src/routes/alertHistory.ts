import {
  type AlertHistoryItem,
  AlertHistoryQuerySchema,
  AlertHistoryResponseSchema,
} from "@protecther/contracts";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  alertAudioChunks,
  alertAudioHidden,
  alertAudioPins,
  alerts,
  emergencyContacts,
  users,
} from "../db/schema.js";
import { apiError } from "../lib/httpErrors.js";
import { toUserPublic } from "../lib/mappers.js";

function getUserId(request: { user?: { sub?: string } }): string | undefined {
  return request.user?.sub;
}

/**
 * GET /alerts/history — alertas da usuária e de quem ela protege (vínculo de
 * contato ativo), ativos e encerrados, com o resumo do áudio de cada um.
 * Mesma regra de acesso de `canReadAlertLocations`.
 */
export async function registerAlertHistoryRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/alerts/history", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }
    const query = AlertHistoryQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", query.error.message));
    }
    const { scope, before, limit } = query.data;

    const protectedOwners = db
      .select({ id: emergencyContacts.ownerUserId })
      .from(emergencyContacts)
      .where(
        and(
          eq(emergencyContacts.contactUserId, userId),
          eq(emergencyContacts.status, "active"),
        ),
      );
    const mine = eq(alerts.ownerUserId, userId);
    const theirs = inArray(alerts.ownerUserId, protectedOwners);
    const owners =
      scope === "mine"
        ? mine
        : scope === "protected"
          ? theirs
          : or(mine, theirs);

    const rows = await db
      .select({ alert: alerts, owner: users })
      .from(alerts)
      .innerJoin(users, eq(users.id, alerts.ownerUserId))
      .where(
        and(
          owners,
          before ? lt(alerts.startedAt, new Date(before)) : undefined,
        ),
      )
      .orderBy(desc(alerts.startedAt))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const ids = page.map((r) => r.alert.id);

    const stats = new Map<string, { chunks: number; totalMs: number }>();
    const pinned = new Map<string, number>();
    if (ids.length > 0) {
      const audioRows = await db
        .select({
          alertId: alertAudioChunks.alertId,
          chunks: sql<number>`count(*)::int`,
          totalMs: sql<number>`coalesce(sum(${alertAudioChunks.durationMs}), 0)::int`,
        })
        .from(alertAudioChunks)
        .where(
          and(
            inArray(alertAudioChunks.alertId, ids),
            sql`not exists (select 1 from ${alertAudioHidden} h where h.user_id = ${userId} and h.chunk_id = ${alertAudioChunks.id})`,
          ),
        )
        .groupBy(alertAudioChunks.alertId);
      for (const r of audioRows) {
        stats.set(r.alertId, { chunks: r.chunks, totalMs: r.totalMs });
      }
      const pinRows = await db
        .select({
          alertId: alertAudioChunks.alertId,
          n: sql<number>`count(*)::int`,
        })
        .from(alertAudioPins)
        .innerJoin(
          alertAudioChunks,
          eq(alertAudioChunks.id, alertAudioPins.chunkId),
        )
        .where(
          and(
            eq(alertAudioPins.userId, userId),
            inArray(alertAudioChunks.alertId, ids),
          ),
        )
        .groupBy(alertAudioChunks.alertId);
      for (const r of pinRows) {
        pinned.set(r.alertId, r.n);
      }
    }

    const items: AlertHistoryItem[] = page.map(({ alert, owner }) => ({
      alert: {
        id: alert.id,
        status: alert.status,
        mode: alert.mode,
        riskLevel: alert.riskLevel,
        startedAt: alert.startedAt.toISOString(),
        endedAt: alert.endedAt ? alert.endedAt.toISOString() : null,
      },
      owner: toUserPublic(owner),
      isOwner: alert.ownerUserId === userId,
      audio: {
        chunks: stats.get(alert.id)?.chunks ?? 0,
        totalMs: stats.get(alert.id)?.totalMs ?? 0,
        pinned: pinned.get(alert.id) ?? 0,
      },
    }));

    const last = page[page.length - 1];
    reply.header("Cache-Control", "private, no-store");
    return reply.send(
      AlertHistoryResponseSchema.parse({
        items,
        nextBefore:
          rows.length > limit && last
            ? last.alert.startedAt.toISOString()
            : null,
      }),
    );
  });
}
