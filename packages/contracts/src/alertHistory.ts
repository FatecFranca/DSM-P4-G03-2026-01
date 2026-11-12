import { z } from "zod";
import {
  AlertModeSchema,
  AlertRiskLevelSchema,
  AlertStatusSchema,
} from "./alerts.js";
import { IsoDateTimeSchema, UserPublicSchema, UuidSchema } from "./common.js";

/**
 * Histórico de alertas: os da própria usuária e os de quem ela protege
 * (contato de segurança ativo), ativos ou encerrados, mais recentes primeiro.
 */
export const AlertHistoryScopeSchema = z.enum(["all", "mine", "protected"]);

export type AlertHistoryScope = z.infer<typeof AlertHistoryScopeSchema>;

export const AlertHistoryQuerySchema = z.object({
  scope: AlertHistoryScopeSchema.default("all"),
  /** Cursor: só alertas iniciados antes deste instante (`nextBefore`). */
  before: IsoDateTimeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type AlertHistoryQuery = z.infer<typeof AlertHistoryQuerySchema>;

export const AlertHistoryItemSchema = z.object({
  alert: z.object({
    id: UuidSchema,
    status: AlertStatusSchema,
    mode: AlertModeSchema,
    riskLevel: AlertRiskLevelSchema,
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.nullable(),
  }),
  owner: UserPublicSchema,
  /** O alerta é da própria usuária (ela pode excluir áudios para todos). */
  isOwner: z.boolean(),
  audio: z.object({
    /** Trechos visíveis para quem consulta (sem os que ela removeu). */
    chunks: z.number().int(),
    totalMs: z.number().int(),
    /** Fixados (★) por quem consulta. */
    pinned: z.number().int(),
  }),
});

export type AlertHistoryItem = z.infer<typeof AlertHistoryItemSchema>;

export const AlertHistoryResponseSchema = z.object({
  items: z.array(AlertHistoryItemSchema),
  /** Passe em `before` para a próxima página; `null` = acabou. */
  nextBefore: IsoDateTimeSchema.nullable(),
});

export type AlertHistoryResponse = z.infer<typeof AlertHistoryResponseSchema>;
