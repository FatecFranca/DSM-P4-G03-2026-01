import { lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { db } from "../db/index.js";
import { alertAudioChunks } from "../db/schema.js";

const DEFAULT_RETENTION_DAYS = 30;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Por quantos dias os áudios do SOS ficam guardados (prova para a vítima).
 * Depois disso são apagados automaticamente (LGPD: limitação de armazenamento).
 */
export function readAudioRetentionDays(): number {
  const raw = process.env.ALERT_AUDIO_RETENTION_DAYS;
  const n = raw === undefined || raw === "" ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_RETENTION_DAYS;
}

export function audioRetentionCutoff(nowMs: number, days: number): Date {
  return new Date(nowMs - days * 24 * 60 * 60 * 1000);
}

export async function purgeExpiredAlertAudio(
  log: FastifyBaseLogger,
  nowMs = Date.now(),
): Promise<number> {
  const cutoff = audioRetentionCutoff(nowMs, readAudioRetentionDays());
  const deleted = await db
    .delete(alertAudioChunks)
    .where(lt(alertAudioChunks.createdAt, cutoff))
    .returning({ id: alertAudioChunks.id });
  if (deleted.length > 0) {
    log.info({ deleted: deleted.length }, "alert_audio_purged");
  }
  return deleted.length;
}

export function startAlertAudioRetentionScheduler(
  log: FastifyBaseLogger,
): () => void {
  const run = () => {
    void purgeExpiredAlertAudio(log).catch((err) => {
      log.error({ err }, "alert_audio_purge_failed");
    });
  };
  run();
  const timer = setInterval(run, PURGE_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
