import { z } from "zod";
import { IsoDateTimeSchema, UserPublicSchema, UuidSchema } from "./common.js";

export const AlertModeSchema = z.enum(["visible", "discreet"]);
export const AlertStatusSchema = z.enum(["active", "closed"]);
export const AlertRiskLevelSchema = z.enum(["normal", "high"]);

export type AlertMode = z.infer<typeof AlertModeSchema>;
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export type AlertRiskLevel = z.infer<typeof AlertRiskLevelSchema>;

export const StartAlertRequestSchema = z.object({
  mode: AlertModeSchema,
});

export type StartAlertRequest = z.infer<typeof StartAlertRequestSchema>;

export const AlertPublicSchema = z.object({
  id: UuidSchema,
  ownerUserId: UuidSchema,
  status: AlertStatusSchema,
  mode: AlertModeSchema,
  riskLevel: AlertRiskLevelSchema,
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable().optional(),
  cancelReason: z.string().nullable().optional(),
  createdAt: IsoDateTimeSchema,
});

export type AlertPublic = z.infer<typeof AlertPublicSchema>;

export const StartAlertResponseSchema = z.object({
  alert: AlertPublicSchema,
});

export type StartAlertResponse = z.infer<typeof StartAlertResponseSchema>;

export const CancelAlertParamsSchema = z.object({
  id: UuidSchema,
});

export type CancelAlertParams = z.infer<typeof CancelAlertParamsSchema>;

export const CancelAlertRequestSchema = z.object({
  pin: z.string().optional(),
});

export type CancelAlertRequest = z.infer<typeof CancelAlertRequestSchema>;

export const CancelAlertResponseSchema = z.object({
  alert: AlertPublicSchema,
});

export type CancelAlertResponse = z.infer<typeof CancelAlertResponseSchema>;

export const ActiveAlertResponseSchema = z.object({
  alert: AlertPublicSchema.nullable(),
});

export type ActiveAlertResponse = z.infer<typeof ActiveAlertResponseSchema>;

/** Subset exposed to emergency contacts (no cancel metadata). */
export const ContactFeedAlertSchema = z.object({
  id: UuidSchema,
  status: AlertStatusSchema,
  mode: AlertModeSchema,
  riskLevel: AlertRiskLevelSchema,
  startedAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});

export const ContactAlertFeedItemSchema = z.object({
  owner: UserPublicSchema,
  alert: ContactFeedAlertSchema,
});

export type ContactAlertFeedItem = z.infer<typeof ContactAlertFeedItemSchema>;

export const ContactsAlertFeedResponseSchema = z.object({
  items: z.array(ContactAlertFeedItemSchema),
});

export type ContactsAlertFeedResponse = z.infer<
  typeof ContactsAlertFeedResponseSchema
>;

/** Ingest one GPS sample for an active alert (owner only). */
export const PostAlertLocationParamsSchema = z.object({
  id: UuidSchema,
});

export type PostAlertLocationParams = z.infer<
  typeof PostAlertLocationParamsSchema
>;

export const PostAlertLocationRequestSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  accuracy: z.number().positive().max(50_000).optional(),
  speed: z.number().min(0).max(400).optional(),
  heading: z.number().gte(0).lte(360).optional(),
  capturedAt: IsoDateTimeSchema,
});

export type PostAlertLocationRequest = z.infer<
  typeof PostAlertLocationRequestSchema
>;

export const AlertLocationPointSchema = z.object({
  id: UuidSchema,
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  capturedAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});

export type AlertLocationPoint = z.infer<typeof AlertLocationPointSchema>;

export const PostAlertLocationResponseSchema = z.object({
  point: AlertLocationPointSchema,
});

export type PostAlertLocationResponse = z.infer<
  typeof PostAlertLocationResponseSchema
>;

export const ListAlertLocationsParamsSchema = z.object({
  id: UuidSchema,
});

export const ListAlertLocationsQuerySchema = z.object({
  since: IsoDateTimeSchema.optional(),
});

export type ListAlertLocationsQuery = z.infer<
  typeof ListAlertLocationsQuerySchema
>;

export const ListAlertLocationsResponseSchema = z.object({
  points: z.array(AlertLocationPointSchema),
});

export type ListAlertLocationsResponse = z.infer<
  typeof ListAlertLocationsResponseSchema
>;

export const AckAlertParamsSchema = z.object({
  id: UuidSchema,
});

export type AckAlertParams = z.infer<typeof AckAlertParamsSchema>;

export const AckAlertResponseSchema = z.object({
  acknowledgedAt: IsoDateTimeSchema,
});

export type AckAlertResponse = z.infer<typeof AckAlertResponseSchema>;
