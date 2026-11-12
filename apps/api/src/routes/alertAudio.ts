import {
  type AlertAudioChunk,
  AlertAudioChunkSchema,
  GetAlertAudioChunkParamsSchema,
  ListAlertAudioParamsSchema,
  ListAlertAudioQuerySchema,
  ListAlertAudioResponseSchema,
  PinAlertAudioParamsSchema,
  PinAlertAudioResponseSchema,
  PostAlertAudioParamsSchema,
  PostAlertAudioRequestSchema,
  PostAlertAudioResponseSchema,
} from "@protecther/contracts";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/index.js";
import { alertAudioChunks, alertAudioPins } from "../db/schema.js";
import { canReadAlertLocations, getAlertById } from "../lib/alertAccess.js";
import {
  decideAudioUpload,
  decodeAudioBase64,
  looksLikeMp4Audio,
  parseByteRange,
} from "../lib/alertAudio.js";
import { apiError } from "../lib/httpErrors.js";
import { logAlertTelemetry } from "../lib/telemetry.js";

const AUDIO_UPLOAD_MAX_PER_MINUTE = Number(
  process.env.ALERT_AUDIO_RATE_MAX_PER_MINUTE ?? 60,
);

/** base64 de 1,5 MB (~2 MB) + campos do JSON. */
const AUDIO_UPLOAD_BODY_LIMIT = 2_200_000;

/** Trechos listados por chamada (~4 h de gravação em trechos de 15 s). */
const AUDIO_LIST_LIMIT = 1000;

const chunkMetaColumns = {
  id: alertAudioChunks.id,
  alertId: alertAudioChunks.alertId,
  capturedAt: alertAudioChunks.capturedAt,
  durationMs: alertAudioChunks.durationMs,
  mimeType: alertAudioChunks.mimeType,
  sizeBytes: alertAudioChunks.sizeBytes,
  createdAt: alertAudioChunks.createdAt,
};

type ChunkMetaRow = {
  id: string;
  capturedAt: Date;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
};

function toChunkPublic(row: ChunkMetaRow, pinned = false): AlertAudioChunk {
  return AlertAudioChunkSchema.parse({
    pinned,
    id: row.id,
    capturedAt: row.capturedAt.toISOString(),
    durationMs: row.durationMs,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  });
}

function getUserId(request: { user?: { sub?: string } }): string | undefined {
  return request.user?.sub;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const direct = (error as { code?: string }).code;
  const cause = (error as { cause?: { code?: string } }).cause?.code;
  return direct === "23505" || cause === "23505";
}

export async function registerAlertAudioRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    "/alerts/:id/audio",
    {
      bodyLimit: AUDIO_UPLOAD_BODY_LIMIT,
      config: {
        rateLimit: {
          max: AUDIO_UPLOAD_MAX_PER_MINUTE,
          timeWindow: "1 minute",
          keyGenerator: (request) => {
            const sub = (request.user as { sub?: string } | undefined)?.sub;
            return sub ? `alert_audio:${sub}` : request.ip;
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

      const params = PostAlertAudioParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply
          .status(400)
          .send(apiError("VALIDATION_ERROR", params.error.message));
      }

      const body = PostAlertAudioRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply
          .status(400)
          .send(apiError("VALIDATION_ERROR", body.error.message));
      }

      const alertId = params.data.id;
      const alert = await getAlertById(alertId);
      if (!alert) {
        return reply
          .status(404)
          .send(apiError("ALERT_NOT_FOUND", "Alert not found"));
      }

      const capturedMs = Date.parse(body.data.capturedAt);
      const decision = decideAudioUpload(userId, alert, capturedMs, Date.now());
      if (!decision.ok) {
        logAlertTelemetry(request.log, "audio_chunk_rejected", {
          alertId,
          reason: decision.reason,
        });
        const message =
          decision.status === 404
            ? "Alert not found"
            : `Audio chunk rejected: ${decision.reason}`;
        return reply
          .status(decision.status)
          .send(apiError(decision.code, message));
      }

      const data = decodeAudioBase64(body.data.dataBase64);
      if (!data || !looksLikeMp4Audio(data)) {
        logAlertTelemetry(request.log, "audio_chunk_rejected", {
          alertId,
          reason: data ? "not_mp4" : "invalid_size",
        });
        return reply
          .status(400)
          .send(apiError("VALIDATION_ERROR", "Invalid audio file"));
      }

      const findExisting = async () => {
        const [row] = await db
          .select(chunkMetaColumns)
          .from(alertAudioChunks)
          .where(
            and(
              eq(alertAudioChunks.alertId, alertId),
              eq(alertAudioChunks.clientChunkId, body.data.clientChunkId),
            ),
          )
          .limit(1);
        return row;
      };

      const existing = await findExisting();
      if (existing) {
        return reply.send(
          PostAlertAudioResponseSchema.parse({
            chunk: toChunkPublic(existing),
            duplicate: true,
          }),
        );
      }

      try {
        const [inserted] = await db
          .insert(alertAudioChunks)
          .values({
            alertId,
            clientChunkId: body.data.clientChunkId,
            capturedAt: new Date(capturedMs),
            durationMs: body.data.durationMs,
            mimeType: body.data.mimeType,
            sizeBytes: data.length,
            data,
          })
          .returning(chunkMetaColumns);

        if (!inserted) {
          return reply
            .status(500)
            .send(apiError("INSERT_FAILED", "Could not store audio"));
        }

        logAlertTelemetry(request.log, "audio_chunk_received", { alertId });

        return reply.status(201).send(
          PostAlertAudioResponseSchema.parse({
            chunk: toChunkPublic(inserted),
            duplicate: false,
          }),
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          const again = await findExisting();
          if (again) {
            return reply.send(
              PostAlertAudioResponseSchema.parse({
                chunk: toChunkPublic(again),
                duplicate: true,
              }),
            );
          }
        }
        request.log.error({ err: error, alertId }, "audio_insert_failed");
        return reply
          .status(500)
          .send(apiError("INSERT_FAILED", "Could not store audio"));
      }
    },
  );

  app.get("/alerts/:id/audio", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const params = ListAlertAudioParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", params.error.message));
    }

    const query = ListAlertAudioQuerySchema.safeParse(request.query);
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

    if (!(await canReadAlertLocations(userId, alert))) {
      return reply
        .status(403)
        .send(apiError("FORBIDDEN", "Not allowed to read this alert"));
    }

    const filters = [eq(alertAudioChunks.alertId, alertId)];
    if (query.data.since !== undefined) {
      filters.push(gt(alertAudioChunks.createdAt, new Date(query.data.since)));
    }

    const rows = await db
      .select(chunkMetaColumns)
      .from(alertAudioChunks)
      .where(and(...filters))
      .orderBy(asc(alertAudioChunks.capturedAt))
      .limit(AUDIO_LIST_LIMIT);

    const pinnedIds = new Set<string>();
    if (rows.length > 0) {
      const pins = await db
        .select({ chunkId: alertAudioPins.chunkId })
        .from(alertAudioPins)
        .where(
          and(
            eq(alertAudioPins.userId, userId),
            inArray(
              alertAudioPins.chunkId,
              rows.map((r) => r.id),
            ),
          ),
        );
      for (const pin of pins) {
        pinnedIds.add(pin.chunkId);
      }
    }

    reply.header("Cache-Control", "private, no-store");
    return reply.send(
      ListAlertAudioResponseSchema.parse({
        chunks: rows.map((r) => toChunkPublic(r, pinnedIds.has(r.id))),
      }),
    );
  });

  /** Fixar (PUT) / desafixar (DELETE) um trecho — vale só para quem pediu. */
  const setPin = async (
    request: FastifyRequest,
    reply: FastifyReply,
    pinned: boolean,
  ) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }
    const params = PinAlertAudioParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", params.error.message));
    }
    const alert = await getAlertById(params.data.id);
    if (!alert) {
      return reply
        .status(404)
        .send(apiError("ALERT_NOT_FOUND", "Alert not found"));
    }
    if (!(await canReadAlertLocations(userId, alert))) {
      return reply
        .status(403)
        .send(apiError("FORBIDDEN", "Not allowed to read this alert"));
    }
    const [chunk] = await db
      .select({ id: alertAudioChunks.id })
      .from(alertAudioChunks)
      .where(
        and(
          eq(alertAudioChunks.id, params.data.chunkId),
          eq(alertAudioChunks.alertId, alert.id),
        ),
      )
      .limit(1);
    if (!chunk) {
      return reply
        .status(404)
        .send(apiError("AUDIO_NOT_FOUND", "Audio chunk not found"));
    }
    if (pinned) {
      await db
        .insert(alertAudioPins)
        .values({ userId, chunkId: chunk.id })
        .onConflictDoNothing();
    } else {
      await db
        .delete(alertAudioPins)
        .where(
          and(
            eq(alertAudioPins.userId, userId),
            eq(alertAudioPins.chunkId, chunk.id),
          ),
        );
    }
    return reply.send(
      PinAlertAudioResponseSchema.parse({ chunkId: chunk.id, pinned }),
    );
  };

  /**
   * Excluir um trecho de vez (para todos), a qualquer momento: a dona do
   * alerta e os contatos que podem ouvi-lo.
   */
  app.delete("/alerts/:id/audio/:chunkId", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }
    const params = GetAlertAudioChunkParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", params.error.message));
    }
    const alert = await getAlertById(params.data.id);
    if (!alert) {
      return reply
        .status(404)
        .send(apiError("ALERT_NOT_FOUND", "Alert not found"));
    }
    if (!(await canReadAlertLocations(userId, alert))) {
      return reply
        .status(403)
        .send(apiError("FORBIDDEN", "Not allowed to read this alert"));
    }
    const deleted = await db
      .delete(alertAudioChunks)
      .where(
        and(
          eq(alertAudioChunks.id, params.data.chunkId),
          eq(alertAudioChunks.alertId, alert.id),
        ),
      )
      .returning({ id: alertAudioChunks.id });
    if (deleted.length === 0) {
      return reply
        .status(404)
        .send(apiError("AUDIO_NOT_FOUND", "Audio chunk not found"));
    }
    request.log.info(
      { alertId: alert.id, chunkId: params.data.chunkId, userId },
      "alert_audio_deleted",
    );
    return reply.status(204).send();
  });

  app.put("/alerts/:id/audio/:chunkId/pin", (request, reply) =>
    setPin(request, reply, true),
  );
  app.delete("/alerts/:id/audio/:chunkId/pin", (request, reply) =>
    setPin(request, reply, false),
  );

  app.get("/alerts/:id/audio/:chunkId", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const params = GetAlertAudioChunkParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", params.error.message));
    }

    const alert = await getAlertById(params.data.id);
    if (!alert) {
      return reply
        .status(404)
        .send(apiError("ALERT_NOT_FOUND", "Alert not found"));
    }

    if (!(await canReadAlertLocations(userId, alert))) {
      return reply
        .status(403)
        .send(apiError("FORBIDDEN", "Not allowed to read this alert"));
    }

    const [chunk] = await db
      .select({
        mimeType: alertAudioChunks.mimeType,
        data: alertAudioChunks.data,
      })
      .from(alertAudioChunks)
      .where(
        and(
          eq(alertAudioChunks.id, params.data.chunkId),
          eq(alertAudioChunks.alertId, alert.id),
        ),
      )
      .limit(1);

    if (!chunk) {
      return reply
        .status(404)
        .send(apiError("AUDIO_NOT_FOUND", "Audio chunk not found"));
    }

    const size = chunk.data.length;
    reply
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Accept-Ranges", "bytes")
      .type(chunk.mimeType);

    const range = parseByteRange(request.headers.range, size);
    if (range === "unsatisfiable") {
      return reply
        .status(416)
        .header("Content-Range", `bytes */${size}`)
        .send();
    }
    if (range) {
      return reply
        .status(206)
        .header("Content-Range", `bytes ${range.start}-${range.end}/${size}`)
        .send(chunk.data.subarray(range.start, range.end + 1));
    }
    return reply.send(chunk.data);
  });
}
