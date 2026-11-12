import {
  type PostAlertAudioRequest,
  PostAlertAudioRequestSchema,
} from "@protecther/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { apiFetchJson } from "../api/client";
import { logMobileTelemetry } from "../lib/telemetry";
import {
  type QueuedAudioChunk,
  SOS_AUDIO_MIME_TYPE,
  classifyUploadStatus,
  enqueueChunk,
  retryDelayMs,
} from "./sosAudio";
import { updateSosAudioState } from "./sosAudioStore";

/**
 * Fila persistente dos trechos de áudio do SOS. O arquivo de cada trecho fica em
 * `Documents/sos-audio/` (o cache pode ser limpo pelo sistema) até o servidor
 * confirmar o recebimento; só então é apagado.
 */

const QUEUE_KEY = "protecther.sosAudio.queue.v1";
const AUDIO_DIR_NAME = "sos-audio";

let queueLock: Promise<unknown> = Promise.resolve();
let isFlushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFailures = 0;

/** Serializa leituras/escritas da fila (gravação e envio rodam em paralelo). */
function withQueueLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queueLock.then(task, task);
  queueLock = run.catch(() => undefined);
  return run;
}

async function loadQueue(): Promise<QueuedAudioChunk[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedAudioChunk[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(items: QueuedAudioChunk[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  updateSosAudioState({ pendingUploads: items.length });
}

function audioDirectory(): Directory {
  const dir = new Directory(Paths.document, AUDIO_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function deleteFileQuietly(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Arquivo já removido: nada a fazer.
  }
}

export async function getAudioQueueDepth(): Promise<number> {
  const q = await loadQueue();
  updateSosAudioState({ pendingUploads: q.length });
  return q.length;
}

/**
 * Move o arquivo recém-gravado (cache do expo-audio) para a pasta da fila e
 * registra o trecho para envio.
 */
export async function enqueueRecordedChunk(
  recordedUri: string,
  meta: Omit<QueuedAudioChunk, "fileUri" | "attempts" | "mimeType">,
): Promise<void> {
  const source = new File(recordedUri);
  if (!source.exists) {
    return;
  }
  const target = new File(audioDirectory(), `${meta.clientChunkId}.m4a`);
  if (target.exists) {
    target.delete();
  }
  source.move(target);

  const item: QueuedAudioChunk = {
    ...meta,
    mimeType: SOS_AUDIO_MIME_TYPE,
    fileUri: target.uri,
    attempts: 0,
  };
  await withQueueLock(async () => {
    const { queue, dropped } = enqueueChunk(await loadQueue(), item);
    for (const old of dropped) {
      deleteFileQuietly(old.fileUri);
    }
    await saveQueue(queue);
  });
}

async function removeFromQueue(clientChunkId: string): Promise<void> {
  await withQueueLock(async () => {
    const q = await loadQueue();
    await saveQueue(q.filter((x) => x.clientChunkId !== clientChunkId));
  });
}

async function markAttempt(clientChunkId: string): Promise<void> {
  await withQueueLock(async () => {
    const q = await loadQueue();
    await saveQueue(
      q.map((x) =>
        x.clientChunkId === clientChunkId
          ? { ...x, attempts: x.attempts + 1 }
          : x,
      ),
    );
  });
}

async function buildRequest(
  item: QueuedAudioChunk,
): Promise<PostAlertAudioRequest | null> {
  const file = new File(item.fileUri);
  if (!file.exists) {
    return null;
  }
  const parsed = PostAlertAudioRequestSchema.safeParse({
    clientChunkId: item.clientChunkId,
    capturedAt: item.capturedAt,
    durationMs: Math.round(item.durationMs),
    mimeType: item.mimeType,
    dataBase64: await file.base64(),
  });
  return parsed.success ? parsed.data : null;
}

function scheduleRetry(getAccessToken: () => string | null): void {
  if (retryTimer) {
    return;
  }
  const delay = retryDelayMs(consecutiveFailures);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushAudioQueue(getAccessToken);
  }, delay);
}

/**
 * Envia os trechos pendentes em ordem de gravação. Para no primeiro erro
 * temporário (sem rede, 5xx…) e agenda nova tentativa com espera crescente.
 */
export async function flushAudioQueue(
  getAccessToken: () => string | null,
): Promise<void> {
  if (isFlushing) {
    return;
  }
  isFlushing = true;
  try {
    // Relê a fila a cada volta: trechos gravados durante o envio entram na mesma rodada.
    for (;;) {
      const item = (await loadQueue())[0];
      if (!item) {
        return;
      }
      const token = getAccessToken();
      if (!token) {
        return;
      }
      const body = await buildRequest(item);
      if (!body) {
        // Arquivo sumiu ou ficou inválido: não há o que reenviar.
        deleteFileQuietly(item.fileUri);
        await removeFromQueue(item.clientChunkId);
        continue;
      }
      const res = await apiFetchJson<unknown>(
        `/alerts/${encodeURIComponent(item.alertId)}/audio`,
        { method: "POST", body: JSON.stringify(body), accessToken: token },
      );
      const outcome = classifyUploadStatus(res.status);
      if (outcome === "retry") {
        consecutiveFailures += 1;
        await markAttempt(item.clientChunkId);
        logMobileTelemetry("audio_chunk_upload_failed", {
          status: res.status,
          alertId: item.alertId,
        });
        scheduleRetry(getAccessToken);
        return;
      }
      consecutiveFailures = 0;
      deleteFileQuietly(item.fileUri);
      await removeFromQueue(item.clientChunkId);
      if (outcome === "sent") {
        updateSosAudioState({ lastSentAt: new Date().toISOString() });
        logMobileTelemetry("audio_chunk_sent", { alertId: item.alertId });
      } else {
        logMobileTelemetry("audio_chunk_dropped", {
          status: res.status,
          alertId: item.alertId,
        });
      }
    }
  } finally {
    isFlushing = false;
  }
}
