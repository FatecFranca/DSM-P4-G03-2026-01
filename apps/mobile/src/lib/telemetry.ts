export type MobileTelemetryEvent =
  | "location_stream_started"
  | "location_stream_stopped"
  | "location_point_sent"
  | "location_stream_failed"
  | "location_queue_enqueued"
  | "location_queue_flushed"
  | "location_queue_depth"
  | "location_flush_rate_limited"
  | "alert_acknowledged"
  | "push_token_skipped"
  | "push_permission_denied"
  | "push_token_registered"
  | "push_token_register_failed"
  | "push_notification_received";

/** Sem PII: apenas códigos/ids já expostos ao cliente. */
export function logMobileTelemetry(
  event: MobileTelemetryEvent,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  if (__DEV__) {
    console.info("[telemetry]", event, fields);
  }
}
