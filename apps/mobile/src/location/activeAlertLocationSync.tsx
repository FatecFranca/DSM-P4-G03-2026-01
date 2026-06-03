import {
  ActiveAlertResponseSchema,
  PostAlertLocationRequestSchema,
} from "@protecther/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { apiFetchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { readSession } from "../auth/sessionStorage";
import { logMobileTelemetry } from "../lib/telemetry";
import { BACKGROUND_LOCATION_TASK } from "./defineLocationTask";
import {
  flushLocationQueue,
  getLocationQueueDepth,
  makeLocationDedupeKey,
  sendLocationOrQueue,
} from "./locationQueue";
import { ACTIVE_ALERT_ID_STORAGE_KEY } from "./locationTaskNames";

const POLL_MS = 25_000;
const STOP_STREAM_LOG_COOLDOWN_MS = 30_000;

function fgIntervalMs(): number {
  const extra = Constants.expoConfig?.extra as
    | { locationForegroundIntervalMs?: number }
    | undefined;
  const v = extra?.locationForegroundIntervalMs;
  return typeof v === "number" && v >= 3000 ? v : 10_000;
}

function bgIntervalMs(): number {
  const extra = Constants.expoConfig?.extra as
    | { locationBackgroundIntervalMs?: number }
    | undefined;
  const v = extra?.locationBackgroundIntervalMs;
  return typeof v === "number" && v >= 5000 ? v : 15_000;
}

async function persistActiveAlertId(alertId: string | null): Promise<void> {
  if (alertId) {
    await AsyncStorage.setItem(ACTIVE_ALERT_ID_STORAGE_KEY, alertId);
  } else {
    await AsyncStorage.removeItem(ACTIVE_ALERT_ID_STORAGE_KEY);
  }
}

export function ActiveAlertLocationSync() {
  const { state, getAccessToken } = useAuth();
  const fgSub = useRef<Location.LocationSubscription | null>(null);
  const fgWatchAlertIdRef = useRef<string | null>(null);
  const streamModeLoggedRef = useRef<string | null>(null);
  const lastQueueDepthLoggedRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const streamStoppedLoggedAtRef = useRef(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  const logStreamStoppedOnce = useCallback(() => {
    const now = Date.now();
    if (now - streamStoppedLoggedAtRef.current < STOP_STREAM_LOG_COOLDOWN_MS) {
      return;
    }
    streamStoppedLoggedAtRef.current = now;
    logMobileTelemetry("location_stream_stopped", {});
  }, []);

  const stopForeground = useCallback(() => {
    fgSub.current?.remove();
    fgSub.current = null;
    fgWatchAlertIdRef.current = null;
  }, []);

  const stopBackground = useCallback(async () => {
    const started = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
    );
    if (started) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  }, []);

  const stopTracking = useCallback(async () => {
    streamModeLoggedRef.current = null;
    lastQueueDepthLoggedRef.current = 0;
    stopForeground();
    await stopBackground();
    logStreamStoppedOnce();
  }, [logStreamStoppedOnce, stopBackground, stopForeground]);

  const startForegroundWatch = useCallback(
    (alertId: string) => {
      if (fgWatchAlertIdRef.current === alertId && fgSub.current) {
        return;
      }
      stopForeground();
      void (async () => {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          return;
        }
        try {
          fgSub.current = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: fgIntervalMs(),
              distanceInterval: 15,
            },
            async (loc) => {
              const token = getAccessTokenRef.current();
              if (!token) {
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
                getAccessTokenRef.current,
              );
            },
          );
          fgWatchAlertIdRef.current = alertId;
        } catch {
          logMobileTelemetry("location_stream_failed", {
            reason: "fg_watch_start",
          });
        }
      })();
    },
    [stopForeground],
  );

  const tryStartBackground = useCallback(async (alertId: string) => {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      return;
    }
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== "granted") {
      const modeKey = `${alertId}:foreground_only`;
      if (streamModeLoggedRef.current !== modeKey) {
        streamModeLoggedRef.current = modeKey;
        logMobileTelemetry("location_stream_started", {
          alertId,
          mode: "foreground_only",
        });
      }
      return;
    }
    await persistActiveAlertId(alertId);
    const already = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
    );
    if (!already) {
      try {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: bgIntervalMs(),
          distanceInterval: 15,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "ProtectHer",
            notificationBody:
              "Localização ativa durante o alerta para seus contatos.",
          },
        });
        const modeKey = `${alertId}:background`;
        if (streamModeLoggedRef.current !== modeKey) {
          streamModeLoggedRef.current = modeKey;
          logMobileTelemetry("location_stream_started", {
            alertId,
            mode: "background",
          });
        }
      } catch {
        logMobileTelemetry("location_stream_failed", {
          reason: "bg_start_failed",
        });
      }
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncInFlightRef.current) {
      return;
    }
    syncInFlightRef.current = true;
    try {
      if (state.status !== "authenticated") {
        await persistActiveAlertId(null);
        await stopTracking();
        return;
      }
      const session = await readSession();
      if (!session) {
        return;
      }
      const depth = await getLocationQueueDepth();
      if (depth > 0 && depth !== lastQueueDepthLoggedRef.current) {
        lastQueueDepthLoggedRef.current = depth;
        logMobileTelemetry("location_queue_depth", { depth });
      }
      void flushLocationQueue(getAccessTokenRef.current);

      const res = await apiFetchJson<unknown>("/alerts/active", {
        method: "GET",
        accessToken: session.accessToken,
      });
      if (!res.ok) {
        return;
      }
      const parsed = ActiveAlertResponseSchema.safeParse(res.data);
      if (!parsed.success) {
        logMobileTelemetry("location_stream_failed", {
          reason: "active_parse_failed",
        });
        return;
      }
      const active = parsed.data.alert;
      if (!active) {
        await persistActiveAlertId(null);
        await stopTracking();
        return;
      }

      await persistActiveAlertId(active.id);

      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        const requested = await Location.requestForegroundPermissionsAsync();
        if (requested.status !== "granted") {
          logMobileTelemetry("location_stream_failed", {
            reason: "permission_denied",
          });
          return;
        }
      }

      await tryStartBackground(active.id);

      const bg = await Location.getBackgroundPermissionsAsync();
      const bgRunning = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK,
      );
      if (
        appState.current === "active" &&
        !(bg.status === "granted" && bgRunning)
      ) {
        startForegroundWatch(active.id);
      } else if (bg.status === "granted" && bgRunning) {
        stopForeground();
      }
    } finally {
      syncInFlightRef.current = false;
    }
  }, [
    startForegroundWatch,
    state.status,
    stopForeground,
    stopTracking,
    tryStartBackground,
  ]);

  const syncRef = useRef(sync);
  syncRef.current = sync;

  useEffect(() => {
    if (state.status !== "authenticated") {
      return;
    }
    const runSync = () => void syncRef.current();
    void runSync();
    const interval = setInterval(runSync, POLL_MS);
    const sub = AppState.addEventListener("change", (next) => {
      appState.current = next;
      if (next === "active") {
        void runSync();
      } else if (next === "background" || next === "inactive") {
        stopForeground();
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
      stopForeground();
      void stopBackground();
    };
  }, [state.status, stopBackground, stopForeground]);

  return null;
}
