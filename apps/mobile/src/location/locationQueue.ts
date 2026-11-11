import type { PostAlertLocationRequest } from "@protecther/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetchJson } from "../api/client";
import { logMobileTelemetry } from "../lib/telemetry";

const QUEUE_KEY = "protecther.location.queue.v1";
/** Limite: ~2h a 5s no pior caso; descarta os mais antigos (documentado em docs/ARCHITECTURE.md). */
export const LOCATION_QUEUE_MAX = 400;

let isFlushing = false;

export type QueuedLocationPoint = PostAlertLocationRequest & {
  alertId: string;
  dedupeKey: string;
};

function jitterMs(base: number): number {
  return base + Math.floor(Math.random() * Math.min(2000, base));
}

/**
 * Normaliza o `capturedAt` a partir do timestamp do GPS.
 *
 * No emulador (e em aparelhos com GPS frio), o `loc.timestamp` pode vir
 * "congelado" — com um horário bem anterior ao início do alerta. O servidor
 * rejeita `capturedAt` anterior ao `started_at` do alerta (janela de 120s),
 * o que faria o ponto ficar preso na fila para sempre. Aqui limitamos o
 * timestamp ao intervalo [now - 120s, now + 60s]; fora disso usamos "agora".
 */
const MAX_STALE_MS = 120_000;
const MAX_FUTURE_MS = 60_000;

export function safeCapturedAt(timestampMs: number): string {
  const now = Date.now();
  const ts = Number.isFinite(timestampMs) ? timestampMs : now;
  if (now - ts > MAX_STALE_MS || ts - now > MAX_FUTURE_MS) {
    return new Date(now).toISOString();
  }
  return new Date(ts).toISOString();
}

export function makeLocationDedupeKey(
  lat: number,
  lng: number,
  capturedAt: string,
): string {
  const rLat = Math.round(lat * 1e5) / 1e5;
  const rLng = Math.round(lng * 1e5) / 1e5;
  return `${rLat}|${rLng}|${capturedAt}`;
}

async function loadQueue(): Promise<QueuedLocationPoint[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as QueuedLocationPoint[];
  } catch {
    return [];
  }
}

async function saveQueue(items: QueuedLocationPoint[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function getLocationQueueDepth(): Promise<number> {
  const q = await loadQueue();
  return q.length;
}

export async function enqueueLocationPoint(
  item: QueuedLocationPoint,
): Promise<void> {
  const q = await loadQueue();
  if (q.some((x) => x.dedupeKey === item.dedupeKey)) {
    return;
  }
  q.push(item);
  while (q.length > LOCATION_QUEUE_MAX) {
    q.shift();
  }
  await saveQueue(q);
  logMobileTelemetry("location_queue_enqueued", {
    depth: q.length,
    alertId: item.alertId,
  });
}

export async function flushLocationQueue(
  getAccessToken: () => string | null,
): Promise<void> {
  if (isFlushing) {
    return;
  }
  isFlushing = true;

  try {
    const q = await loadQueue();
    if (q.length === 0) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    q.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
    const remaining: QueuedLocationPoint[] = [];
    let backoff = 2000;
    let rateLimited = false;

    for (const item of q) {
      if (rateLimited) {
        remaining.push(item);
        continue;
      }

      const path = `/alerts/${encodeURIComponent(item.alertId)}/location`;
      try {
        const res = await apiFetchJson<unknown>(path, {
          method: "POST",
          body: JSON.stringify({
            lat: item.lat,
            lng: item.lng,
            accuracy: item.accuracy,
            speed: item.speed,
            heading: item.heading,
            capturedAt: safeCapturedAt(Date.parse(item.capturedAt)),
          }),
          accessToken: token,
        });
        if (!res.ok) {
          if (res.status === 429) {
            rateLimited = true;
            remaining.push(item, ...q.slice(q.indexOf(item) + 1));
            break;
          }
          remaining.push(item);
          await new Promise((r) => setTimeout(r, jitterMs(backoff)));
          backoff = Math.min(backoff * 2, 60_000);
        }
      } catch {
        remaining.push(item);
        await new Promise((r) => setTimeout(r, jitterMs(backoff)));
        backoff = Math.min(backoff * 2, 60_000);
      }
    }

    await saveQueue(remaining);
    if (remaining.length < q.length) {
      logMobileTelemetry("location_queue_flushed", {
        remaining: remaining.length,
      });
    }
    if (rateLimited) {
      logMobileTelemetry("location_flush_rate_limited", {
        remaining: remaining.length,
      });
    }
  } finally {
    isFlushing = false;
  }
}

export async function sendLocationOrQueue(
  alertId: string,
  body: PostAlertLocationRequest,
  dedupeKey: string,
  getAccessToken: () => string | null,
): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    await enqueueLocationPoint({ ...body, alertId, dedupeKey });
    return;
  }
  const path = `/alerts/${encodeURIComponent(alertId)}/location`;
  try {
    const res = await apiFetchJson<unknown>(path, {
      method: "POST",
      body: JSON.stringify(body),
      accessToken: token,
    });
    if (res.ok) {
      void flushLocationQueue(getAccessToken);
      return;
    }
    await enqueueLocationPoint({ ...body, alertId, dedupeKey });
  } catch {
    await enqueueLocationPoint({ ...body, alertId, dedupeKey });
  }
}
