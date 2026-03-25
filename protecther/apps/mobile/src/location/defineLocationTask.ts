import { PostAlertLocationRequestSchema } from "@protecther/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { readSession } from "../auth/sessionStorage";
import { logMobileTelemetry } from "../lib/telemetry";
import { makeLocationDedupeKey, sendLocationOrQueue } from "./locationQueue";
import { ACTIVE_ALERT_ID_STORAGE_KEY } from "./locationTaskNames";

export const BACKGROUND_LOCATION_TASK = "protecther-bg-location";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    logMobileTelemetry("location_stream_failed", {
      reason: "task_error",
    });
    return;
  }
  const payload = data as {
    locations?: Location.LocationObject[];
  };
  const locs = payload.locations;
  if (!locs?.length) {
    return;
  }
  const loc = locs[locs.length - 1];
  const session = await readSession();
  if (!session) {
    return;
  }
  const alertId = await AsyncStorage.getItem(ACTIVE_ALERT_ID_STORAGE_KEY);
  if (!alertId) {
    return;
  }
  const body = {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? undefined,
    speed:
      loc.coords.speed != null &&
      !Number.isNaN(loc.coords.speed) &&
      loc.coords.speed >= 0
        ? loc.coords.speed
        : undefined,
    heading:
      loc.coords.heading != null &&
      !Number.isNaN(loc.coords.heading) &&
      loc.coords.heading >= 0
        ? loc.coords.heading
        : undefined,
    capturedAt: new Date(loc.timestamp).toISOString(),
  };
  const valid = PostAlertLocationRequestSchema.safeParse(body);
  if (!valid.success) {
    return;
  }
  const dedupeKey = makeLocationDedupeKey(
    valid.data.lat,
    valid.data.lng,
    valid.data.capturedAt,
  );
  await sendLocationOrQueue(
    alertId,
    valid.data,
    dedupeKey,
    () => session.accessToken,
  );
  logMobileTelemetry("location_point_sent", { alertId });
});
