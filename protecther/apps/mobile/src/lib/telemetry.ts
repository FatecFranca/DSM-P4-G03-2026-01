export type MobileTelemetryEvent =
  | "location_stream_started"
  | "location_point_sent"
  | "location_stream_failed"
  | "alert_acknowledged";

/** Sem PII: apenas códigos/ids já expostos ao cliente. */
export function logMobileTelemetry(
  event: MobileTelemetryEvent,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  if (__DEV__) {
    console.info("[telemetry]", event, fields);
  }
}
