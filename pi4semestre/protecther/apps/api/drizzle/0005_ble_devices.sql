CREATE TABLE "ble_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text NOT NULL,
	"service_uuid" text NOT NULL,
	"characteristic_uuid" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ble_devices" ADD CONSTRAINT "ble_devices_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ble_devices_owner_idx" ON "ble_devices" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ble_devices_owner_device_uidx" ON "ble_devices" USING btree ("owner_user_id","device_id");