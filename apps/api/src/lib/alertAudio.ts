import { ALERT_AUDIO_CHUNK_MAX_BYTES } from "@protecther/contracts";
import type { AlertRow } from "./alertAccess.js";

/** Tolerância de relógio entre celular e servidor. */
export const AUDIO_CLOCK_SKEW_MS = 120_000;

/**
 * Por quanto tempo depois de encerrado o alerta ainda aceitamos trechos que
 * ficaram na fila offline do celular (gravados enquanto o alerta estava ativo).
 */
export const AUDIO_LATE_UPLOAD_WINDOW_MS = Number(
  process.env.ALERT_AUDIO_LATE_UPLOAD_WINDOW_MS ?? 24 * 60 * 60 * 1000,
);

/** Decodifica o base64 do trecho; `null` se vazio ou acima do limite. */
export function decodeAudioBase64(dataBase64: string): Buffer | null {
  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length === 0 || buffer.length > ALERT_AUDIO_CHUNK_MAX_BYTES) {
    return null;
  }
  return buffer;
}

/**
 * Confere a assinatura do arquivo em vez de confiar no `mimeType` do cliente:
 * MP4/M4A tem a caixa `ftyp` nos bytes 4..7.
 */
export function looksLikeMp4Audio(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.toString("latin1", 4, 8) === "ftyp";
}

export type AudioUploadDecision =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 404 | 409;
      code: string;
      reason: string;
    };

/**
 * Regras de quem/quando pode enviar áudio de um alerta:
 * - só a dona do alerta;
 * - o trecho precisa ter começado depois do início do alerta;
 * - com o alerta encerrado, aceita só trechos gravados antes do encerramento e
 *   enviados até `AUDIO_LATE_UPLOAD_WINDOW_MS` depois (fila offline).
 */
export function decideAudioUpload(
  userId: string,
  alert: Pick<AlertRow, "ownerUserId" | "status" | "startedAt" | "endedAt">,
  capturedMs: number,
  nowMs: number,
): AudioUploadDecision {
  if (alert.ownerUserId !== userId) {
    return {
      ok: false,
      status: 404,
      code: "ALERT_NOT_FOUND",
      reason: "not_owner",
    };
  }
  if (capturedMs > nowMs + AUDIO_CLOCK_SKEW_MS) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      reason: "captured_in_future",
    };
  }
  if (capturedMs < alert.startedAt.getTime() - AUDIO_CLOCK_SKEW_MS) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      reason: "before_alert_start",
    };
  }
  if (alert.status === "active") {
    return { ok: true };
  }
  const endedMs = alert.endedAt?.getTime();
  if (endedMs === undefined) {
    return {
      ok: false,
      status: 409,
      code: "ALERT_NOT_ACTIVE",
      reason: "closed_without_end",
    };
  }
  if (capturedMs > endedMs + AUDIO_CLOCK_SKEW_MS) {
    return {
      ok: false,
      status: 409,
      code: "ALERT_NOT_ACTIVE",
      reason: "captured_after_end",
    };
  }
  if (nowMs - endedMs > AUDIO_LATE_UPLOAD_WINDOW_MS) {
    return {
      ok: false,
      status: 409,
      code: "ALERT_NOT_ACTIVE",
      reason: "late_upload_window_expired",
    };
  }
  return { ok: true };
}

export type ByteRange = { start: number; end: number };

/**
 * Interpreta um cabeçalho `Range: bytes=...` simples (um intervalo só).
 * O AVPlayer do iOS pede intervalos antes de tocar arquivos remotos.
 * - `null`: sem Range (ou formato não suportado) → responder o arquivo todo;
 * - `"unsatisfiable"`: intervalo fora do arquivo → 416.
 */
export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!header) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return null;
  }
  const [, rawStart = "", rawEnd = ""] = match;
  if (rawStart === "" && rawEnd === "") {
    return null;
  }
  let start: number;
  let end: number;
  if (rawStart === "") {
    // Sufixo: os últimos N bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0) {
      return "unsatisfiable";
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start >= size || start > end) {
    return "unsatisfiable";
  }
  return { start, end };
}
