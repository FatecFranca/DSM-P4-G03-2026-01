import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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
