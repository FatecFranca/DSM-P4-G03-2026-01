CREATE TABLE "alert_audio_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"client_chunk_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_audio_chunks" ADD CONSTRAINT "alert_audio_chunks_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_audio_chunks_alert_client_uidx" ON "alert_audio_chunks" USING btree ("alert_id","client_chunk_id");--> statement-breakpoint
CREATE INDEX "alert_audio_chunks_alert_captured_idx" ON "alert_audio_chunks" USING btree ("alert_id","captured_at");--> statement-breakpoint
CREATE INDEX "alert_audio_chunks_created_idx" ON "alert_audio_chunks" USING btree ("created_at");