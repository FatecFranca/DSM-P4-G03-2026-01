import { ALERT_AUDIO_CHUNK_TARGET_MS } from "@protecther/contracts";

/**
 * Regras puras do áudio do SOS (sem React Native): tamanho dos trechos, fila de
 * envio, quando pedir a permissão do microfone e textos de status. Testadas em
 * `sosAudio.test.ts`.
 */

/** Duração de cada trecho gravado antes de ser enviado. */
export const SOS_AUDIO_CHUNK_MS = ALERT_AUDIO_CHUNK_TARGET_MS;

/** Trechos menores que isso (ex.: alerta encerrado logo depois) são descartados. */
export const SOS_AUDIO_MIN_CHUNK_MS = 1_000;

/** Máximo de trechos aguardando envio (~2 h sem internet com trechos de 15 s). */
export const SOS_AUDIO_QUEUE_MAX = 480;

/** Depois de "Agora não", a explicação do microfone volta a aparecer após esse tempo. */
export const MIC_EXPLANATION_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export const SOS_AUDIO_MIME_TYPE = "audio/mp4" as const;

export type QueuedAudioChunk = {
  alertId: string;
  clientChunkId: string;
  /** Início da gravação do trecho (ISO). */
  capturedAt: string;
  durationMs: number;
  mimeType: typeof SOS_AUDIO_MIME_TYPE;
  /** Arquivo local (file://) que ainda não foi enviado. */
  fileUri: string;
  attempts: number;
};

/** Id curto e único por trecho (o Hermes não tem `crypto.randomUUID`). */
export function makeClientChunkId(
  nowMs: number,
  random: () => number = Math.random,
): string {
  const rand = Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0");
  return `${nowMs.toString(36)}-${rand}`;
}

/**
 * Adiciona um trecho à fila sem duplicar e respeitando o limite. Quando passa do
 * limite, descarta os mais antigos e devolve quais foram descartados (para apagar
 * os arquivos).
 */
export function enqueueChunk(
  queue: readonly QueuedAudioChunk[],
  item: QueuedAudioChunk,
  max = SOS_AUDIO_QUEUE_MAX,
): { queue: QueuedAudioChunk[]; dropped: QueuedAudioChunk[] } {
  if (queue.some((q) => q.clientChunkId === item.clientChunkId)) {
    return { queue: [...queue], dropped: [] };
  }
  const next = [...queue, item].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
  const overflow = Math.max(0, next.length - max);
  return { queue: next.slice(overflow), dropped: next.slice(0, overflow) };
}

export type UploadOutcome = "sent" | "retry" | "drop";

/**
 * O que fazer com um trecho depois de tentar enviar:
 * - `sent`: chegou (inclui reenvio já recebido);
 * - `retry`: sem rede, sessão expirada, limite de envio ou erro do servidor;
 * - `drop`: o servidor nunca vai aceitar (alerta de outra conta, fora da janela,
 *   arquivo inválido) → apaga para não travar a fila.
 */
export function classifyUploadStatus(status: number): UploadOutcome {
  if (status === 200 || status === 201) {
    return "sent";
  }
  if (
    status === 0 ||
    status === 401 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  ) {
    return "retry";
  }
  return "drop";
}

/** Espera entre tentativas de reenvio: 5 s, 10 s, 20 s… até 2 min. */
export function retryDelayMs(attempt: number): number {
  const safe = Math.max(0, Math.min(attempt, 10));
  return Math.min(5_000 * 2 ** safe, 120_000);
}

/** Espera antes de tentar religar o microfone depois de uma falha. */
export function recorderRestartDelayMs(failures: number): number {
  const safe = Math.max(0, Math.min(failures, 6));
  return Math.min(2_000 * 2 ** safe, 30_000);
}

export type MicPermissionSnapshot = {
  granted: boolean;
  canAskAgain: boolean;
};

/**
 * Mostra a explicação do microfone (antes do pedido do sistema) só quando ainda
 * dá para pedir e a pessoa não respondeu "Agora não" recentemente.
 */
export function shouldShowMicExplanation(
  permission: MicPermissionSnapshot,
  dismissedAtMs: number | null,
  nowMs: number,
): boolean {
  if (permission.granted || !permission.canAskAgain) {
    return false;
  }
  if (dismissedAtMs === null) {
    return true;
  }
  return nowMs - dismissedAtMs >= MIC_EXPLANATION_SNOOZE_MS;
}

export type SosAudioStatus =
  | "idle"
  | "starting"
  | "recording"
  | "needs_permission"
  | "waiting_foreground"
  | "paused_by_user"
  | "error";

export type SosAudioState = {
  status: SosAudioStatus;
  alertId: string | null;
  /** Trechos gravados neste alerta (nesta sessão do app). */
  chunksRecorded: number;
  /** Trechos aguardando envio (todos os alertas). */
  pendingUploads: number;
  /** Último envio confirmado pelo servidor (ISO). */
  lastSentAt: string | null;
  /** Grava só com o app aberto (Android sem permissão de notificações). */
  foregroundOnly: boolean;
};

export const INITIAL_SOS_AUDIO_STATE: SosAudioState = {
  status: "idle",
  alertId: null,
  chunksRecorded: 0,
  pendingUploads: 0,
  lastSentAt: null,
  foregroundOnly: false,
};

export type SosAudioStatusText = {
  title: string;
  detail: string;
  tone: "ok" | "warning" | "neutral";
};

/** Textos do cartão "Áudio do alerta" na tela do alerta ativo. */
export function describeSosAudioStatus(
  state: SosAudioState,
): SosAudioStatusText {
  const seconds = Math.round(SOS_AUDIO_CHUNK_MS / 1000);
  const pending =
    state.pendingUploads > 0
      ? ` ${state.pendingUploads} ${
          state.pendingUploads === 1 ? "trecho aguarda" : "trechos aguardam"
        } conexão para enviar.`
      : "";
  switch (state.status) {
    case "recording":
      return {
        title: "Gravando o som ambiente",
        detail: `Seus contatos recebem um trecho a cada ${seconds} s.${
          state.foregroundOnly
            ? " Mantenha o app aberto: sem notificações permitidas, a gravação pausa em segundo plano."
            : ""
        }${pending}`,
        tone: "ok",
      };
    case "starting":
      return {
        title: "Ligando o microfone…",
        detail: `Os trechos começam a ser enviados em instantes.${pending}`,
        tone: "neutral",
      };
    case "needs_permission":
      return {
        title: "Áudio desligado",
        detail:
          "Permita o microfone para que seus contatos ouçam o que está acontecendo.",
        tone: "warning",
      };
    case "waiting_foreground":
      return {
        title: "Abra o app para gravar",
        detail: `O sistema só deixa ligar o microfone com o app aberto. A gravação começa assim que você abrir.${pending}`,
        tone: "warning",
      };
    case "paused_by_user":
      return {
        title: "Gravação pausada",
        detail: `Você pausou o áudio deste alerta.${pending}`,
        tone: "neutral",
      };
    case "error":
      return {
        title: "Tentando religar o microfone",
        detail: `O microfone foi interrompido (por exemplo, por uma ligação). Tentando de novo.${pending}`,
        tone: "warning",
      };
    default:
      return {
        title: "Áudio pronto",
        detail: pending.trim() || "O áudio é gravado só durante um alerta.",
        tone: "neutral",
      };
  }
}

/** "14:32:05" no fuso do aparelho. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "14:32:05 · 15 s" para a lista de trechos do contato. */
export function formatChunkLabel(capturedAtIso: string, durationMs: number) {
  return `${formatClock(capturedAtIso)} · ${Math.max(1, Math.round(durationMs / 1000))} s`;
}

/**
 * Próximo trecho a tocar no modo "ouvir ao vivo": o primeiro depois do último
 * tocado; se nada foi tocado ainda, começa pelo mais recente (é "ao vivo").
 */
export function nextLiveChunkId(
  chunks: readonly { id: string }[],
  lastPlayedId: string | null,
): string | null {
  if (chunks.length === 0) {
    return null;
  }
  if (lastPlayedId === null) {
    return chunks[chunks.length - 1]?.id ?? null;
  }
  const index = chunks.findIndex((c) => c.id === lastPlayedId);
  if (index === -1) {
    return chunks[chunks.length - 1]?.id ?? null;
  }
  return chunks[index + 1]?.id ?? null;
}

/** Trechos por página na lista do contato. */
export const AUDIO_PAGE_SIZE = 10;

export function pageCount(total: number, pageSize = AUDIO_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Itens da página `page` (0 = mais recentes); `items` já em ordem de exibição. */
export function pageSlice<T>(
  items: readonly T[],
  page: number,
  pageSize = AUDIO_PAGE_SIZE,
): T[] {
  const last = pageCount(items.length, pageSize) - 1;
  const safe = Math.min(Math.max(0, page), last);
  return items.slice(safe * pageSize, safe * pageSize + pageSize);
}

/**
 * Botões do paginador: todas as páginas quando são poucas; senão a primeira,
 * a última e as vizinhas da atual, com "…" nos saltos. Páginas a partir de 0.
 */
export function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const keep = new Set([0, total - 1, current - 1, current, current + 1]);
  const out: (number | "…")[] = [];
  for (let i = 0; i < total; i++) {
    if (keep.has(i)) {
      out.push(i);
    } else if (out[out.length - 1] !== "…") {
      out.push("…");
    }
  }
  return out;
}
