CREATE TABLE "alert_audio_hidden" (
	"user_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_audio_hidden_user_id_chunk_id_pk" PRIMARY KEY("user_id","chunk_id")
);
--> statement-breakpoint
ALTER TABLE "alert_audio_hidden" ADD CONSTRAINT "alert_audio_hidden_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_audio_hidden" ADD CONSTRAINT "alert_audio_hidden_chunk_id_alert_audio_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."alert_audio_chunks"("id") ON DELETE cascade ON UPDATE no action;