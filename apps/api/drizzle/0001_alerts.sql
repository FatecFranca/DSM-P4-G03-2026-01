CREATE TYPE "public"."alert_audit_event" AS ENUM('started', 'cancelled', 'cancelled_duress');--> statement-breakpoint
CREATE TYPE "public"."alert_mode" AS ENUM('visible', 'discreet');--> statement-breakpoint
CREATE TYPE "public"."alert_risk_level" AS ENUM('normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TABLE "alert_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"event" "alert_audit_event" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" "alert_status" DEFAULT 'active' NOT NULL,
	"mode" "alert_mode" NOT NULL,
	"risk_level" "alert_risk_level" DEFAULT 'normal' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_audit_events" ADD CONSTRAINT "alert_audit_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_audit_events" ADD CONSTRAINT "alert_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_one_active_per_owner_idx" ON "alerts" USING btree ("owner_user_id") WHERE "alerts"."status" = 'active';