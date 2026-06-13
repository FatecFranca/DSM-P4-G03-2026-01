import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

/**
 * Metro serves the JS bundle from the dev machine. When `EXPO_PUBLIC_API_URL` is still
 * `localhost` / `127.0.0.1`, the app must call the PC’s LAN IP (physical device) or
 * `10.0.2.2` (Android emulator), otherwise fetch throws `Network request failed`.
 */
function packagerHostnameForDev(): string | null {
  const scriptURL = NativeModules.SourceCode?.scriptURL;
  if (typeof scriptURL !== "string") {
    return null;
  }
  try {
    const { hostname } = new URL(scriptURL);
    if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
      return null;
    }
    /* Expo tunnel: Metro host is not where the API runs */
    if (hostname.includes("exp.direct") || hostname.endsWith(".exp.host")) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

function resolveDevLoopback(baseUrl: string): string {
  if (!__DEV__) {
    return baseUrl;
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return baseUrl;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!loopback) {
    return baseUrl;
  }

  const fromPackager = packagerHostnameForDev();
  if (fromPackager) {
    url.hostname = fromPackager;
    return url.toString().replace(/\/$/, "");
  }

  if (Platform.OS === "android") {
    url.hostname = "10.0.2.2";
    return url.toString().replace(/\/$/, "");
  }

  return baseUrl;
}

function readConfiguredApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }

  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromExtra === "string" && fromExtra.length > 0) {
    return fromExtra.replace(/\/$/, "");
  }

  throw new Error(
    "Missing API URL — set EXPO_PUBLIC_API_URL in apps/mobile/.env and restart Metro.",
  );
}

/**
 * Base URL for the ProtectHer API.
 * Prefer `EXPO_PUBLIC_API_URL` from the Metro bundle (`.env` at bundle time).
 * Falls back to `extra.apiUrl` embedded in the native dev client build.
 */
export function getApiBaseUrl(): string {
  return resolveDevLoopback(readConfiguredApiUrl());
}
