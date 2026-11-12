import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

export const contactStatusEnum = pgEnum("contact_status", [
  "active",
  "revoked",
]);

export const alertStatusEnum = pgEnum("alert_status", ["active", "closed"]);

export const alertModeEnum = pgEnum("alert_mode", ["visible", "discreet"]);

export const alertRiskLevelEnum = pgEnum("alert_risk_level", [
  "normal",
  "high",
]);

export const alertAuditEventEnum = pgEnum("alert_audit_event", [
  "started",
  "cancelled",
  "cancelled_duress",
  "escalated",
]);

export const devicePlatformEnum = pgEnum("device_platform", [
  "ios",
  "android",
  "web",
]);

export const pushDeliveryKindEnum = pgEnum("push_delivery_kind", [
  "alert_started",
  "escalation",
]);

export const pushPriorityEnum = pgEnum("push_priority", ["normal", "high"]);

/** Postgres `bytea` ↔ Node `Buffer` (drizzle-orm 0.40 não tem tipo nativo). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invites = pgTable("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: text("token").notNull().unique(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  targetEmail: text("target_email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: inviteStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const emergencyContacts = pgTable(
  "emergency_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    contactUserId: uuid("contact_user_id")
      .notNull()
      .references(() => users.id),
    status: contactStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("emergency_contacts_active_pair_idx")
      .on(table.ownerUserId, table.contactUserId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    status: alertStatusEnum("status").notNull().default("active"),
    mode: alertModeEnum("mode").notNull(),
    riskLevel: alertRiskLevelEnum("risk_level").notNull().default("normal"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    lastEscalationAt: timestamp("last_escalation_at", { withTimezone: true }),
    escalationCount: integer("escalation_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("alerts_one_active_per_owner_idx")
      .on(table.ownerUserId)
      .where(sql`${table.status} = 'active'`),
    index("alerts_owner_status_idx").on(table.ownerUserId, table.status),
  ],
);

export const alertLocations = pgTable(
  "alert_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracy: real("accuracy"),
    speed: real("speed"),
    heading: real("heading"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("alert_locations_alert_captured_idx").on(
      table.alertId,
      table.capturedAt,
    ),
  ],
);

/**
 * Trechos de áudio gravados pelo celular durante o alerta (SOS).
 * Finalidade: permitir que os contatos ouçam o que está acontecendo e guardar
 * como prova. Retenção: ALERT_AUDIO_RETENTION_DAYS (ver jobs/audioRetention.ts).
 */
export const alertAudioChunks = pgTable(
  "alert_audio_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id),
    /** Id gerado no celular; torna o reenvio da fila idempotente. */
    clientChunkId: text("client_chunk_id").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("alert_audio_chunks_alert_client_uidx").on(
      table.alertId,
      table.clientChunkId,
    ),
    index("alert_audio_chunks_alert_captured_idx").on(
      table.alertId,
      table.capturedAt,
    ),
    index("alert_audio_chunks_created_idx").on(table.createdAt),
  ],
);

/** Trechos "fixados" (favoritos) por cada usuário que pode ouvir o alerta. */
export const alertAudioPins = pgTable(
  "alert_audio_pins",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => alertAudioChunks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.chunkId] })],
);

/** Trechos que um contato tirou da própria lista (para os outros continuam). */
export const alertAudioHidden = pgTable(
  "alert_audio_hidden",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => alertAudioChunks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.chunkId] })],
);

export const alertAcknowledgments = pgTable(
  "alert_acknowledgments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id),
    contactUserId: uuid("contact_user_id")
      .notNull()
      .references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("alert_ack_alert_id_idx").on(table.alertId),
    uniqueIndex("alert_ack_alert_contact_idx").on(
      table.alertId,
      table.contactUserId,
    ),
  ],
);

export const alertAuditEvents = pgTable("alert_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  alertId: uuid("alert_id")
    .notNull()
    .references(() => alerts.id),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id),
  event: alertAuditEventEnum("event").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  payload: jsonb("payload").$type<Record<string, unknown> | null>(),
});

export const devicePushTokens = pgTable(
  "device_push_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    platform: devicePlatformEnum("platform").notNull(),
    token: text("token").notNull(),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("device_push_tokens_user_token_uidx").on(
      table.userId,
      table.token,
    ),
    index("device_push_tokens_user_idx").on(table.userId),
  ],
);

export const pushDeliveryEvents = pgTable(
  "push_delivery_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id),
    kind: pushDeliveryKindEnum("kind").notNull(),
    priority: pushPriorityEnum("priority").notNull(),
    success: boolean("success").notNull(),
    errorCode: text("error_code"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("push_delivery_events_alert_idx").on(table.alertId)],
);

export const bleDevices = pgTable(
  "ble_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    deviceId: text("device_id").notNull(),
    deviceName: text("device_name").notNull(),
    serviceUuid: text("service_uuid").notNull(),
    characteristicUuid: text("characteristic_uuid").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ble_devices_owner_idx").on(table.ownerUserId),
    uniqueIndex("ble_devices_owner_device_uidx").on(
      table.ownerUserId,
      table.deviceId,
    ),
  ],
);
