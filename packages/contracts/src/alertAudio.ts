import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

/**
 * Áudio do SOS: durante um alerta ativo o app grava o som ambiente em trechos
 * curtos (AAC/M4A) e envia cada trecho para que os contatos de segurança ouçam.
 */

/** Duração-alvo de cada trecho gravado no celular. */
export const ALERT_AUDIO_CHUNK_TARGET_MS = 15_000;

/** Duração máxima aceita por trecho (folga para atrasos do timer em segundo plano). */
export const ALERT_AUDIO_CHUNK_MAX_DURATION_MS = 90_000;

/** Tamanho máximo do arquivo de um trecho (bytes, já decodificado). */
export const ALERT_AUDIO_CHUNK_MAX_BYTES = 1_500_000;

/** Formatos aceitos. Hoje só AAC em contêiner MP4/M4A (iOS e Android). */
export const AlertAudioMimeTypeSchema = z.enum(["audio/mp4"]);

export type AlertAudioMimeType = z.infer<typeof AlertAudioMimeTypeSchema>;

/** Id gerado no celular para tornar o envio idempotente (reenvio da fila). */
export const AlertAudioClientChunkIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "invalid clientChunkId");

export const PostAlertAudioParamsSchema = z.object({
  id: UuidSchema,
});

export type PostAlertAudioParams = z.infer<typeof PostAlertAudioParamsSchema>;

/** Base64 de no máximo ALERT_AUDIO_CHUNK_MAX_BYTES bytes. */
const MAX_BASE64_LENGTH = Math.ceil(ALERT_AUDIO_CHUNK_MAX_BYTES / 3) * 4;

export const PostAlertAudioRequestSchema = z.object({
  clientChunkId: AlertAudioClientChunkIdSchema,
  /** Início da gravação do trecho. */
  capturedAt: IsoDateTimeSchema,
  durationMs: z.number().int().min(200).max(ALERT_AUDIO_CHUNK_MAX_DURATION_MS),
  mimeType: AlertAudioMimeTypeSchema,
  dataBase64: z
    .string()
    .min(16)
    .max(MAX_BASE64_LENGTH)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "dataBase64 must be base64"),
});

export type PostAlertAudioRequest = z.infer<typeof PostAlertAudioRequestSchema>;

export const AlertAudioChunkSchema = z.object({
  id: UuidSchema,
  capturedAt: IsoDateTimeSchema,
  durationMs: z.number().int(),
  mimeType: AlertAudioMimeTypeSchema,
  sizeBytes: z.number().int(),
  createdAt: IsoDateTimeSchema,
});

export type AlertAudioChunk = z.infer<typeof AlertAudioChunkSchema>;

export const PostAlertAudioResponseSchema = z.object({
  chunk: AlertAudioChunkSchema,
  /** `true` quando o mesmo `clientChunkId` já havia sido recebido. */
  duplicate: z.boolean(),
});

export type PostAlertAudioResponse = z.infer<
  typeof PostAlertAudioResponseSchema
>;

export const ListAlertAudioParamsSchema = z.object({
  id: UuidSchema,
});

export const ListAlertAudioQuerySchema = z.object({
  /** Só trechos recebidos depois deste instante (`createdAt`). */
  since: IsoDateTimeSchema.optional(),
});

export type ListAlertAudioQuery = z.infer<typeof ListAlertAudioQuerySchema>;

export const ListAlertAudioResponseSchema = z.object({
  /** Ordenados por `capturedAt` crescente. */
  chunks: z.array(AlertAudioChunkSchema),
});

export type ListAlertAudioResponse = z.infer<
  typeof ListAlertAudioResponseSchema
>;

export const GetAlertAudioChunkParamsSchema = z.object({
  id: UuidSchema,
  chunkId: UuidSchema,
});

export type GetAlertAudioChunkParams = z.infer<
  typeof GetAlertAudioChunkParamsSchema
>;
