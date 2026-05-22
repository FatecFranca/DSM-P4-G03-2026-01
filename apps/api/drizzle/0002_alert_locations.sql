ALTER TYPE "public"."alert_audit_event" ADD VALUE 'escalated';--> statement-breakpoint
CREATE TABLE "alert_acknowledgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"contact_user_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy" real,
	"speed" real,
	"heading" real,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "last_escalation_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "escalation_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_acknowledgments" ADD CONSTRAINT "alert_acknowledgments_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_acknowledgments" ADD CONSTRAINT "alert_acknowledgments_contact_user_id_users_id_fk" FOREIGN KEY ("contact_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_locations" ADD CONSTRAINT "alert_locations_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_ack_alert_contact_idx" ON "alert_acknowledgments" USING btree ("alert_id","contact_user_id");--> statement-breakpoint
CREATE INDEX "alert_locations_alert_captured_idx" ON "alert_locations" USING btree ("alert_id","captured_at");