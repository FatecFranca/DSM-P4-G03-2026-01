CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "public"."push_delivery_kind" AS ENUM('alert_started', 'escalation');--> statement-breakpoint
CREATE TYPE "public"."push_priority" AS ENUM('normal', 'high');--> statement-breakpoint
CREATE TABLE "device_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "device_platform" NOT NULL,
	"token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"kind" "push_delivery_kind" NOT NULL,
	"priority" "push_priority" NOT NULL,
	"success" boolean NOT NULL,
	"error_code" text,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_delivery_events" ADD CONSTRAINT "push_delivery_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_delivery_events" ADD CONSTRAINT "push_delivery_events_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_push_tokens_user_token_uidx" ON "device_push_tokens" USING btree ("user_id","token");--> statement-breakpoint
CREATE INDEX "device_push_tokens_user_idx" ON "device_push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_delivery_events_alert_idx" ON "push_delivery_events" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "alert_ack_alert_id_idx" ON "alert_acknowledgments" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "alerts_owner_status_idx" ON "alerts" USING btree ("owner_user_id","status");