import Constants from "expo-constants";

/**
 * Base URL for the ProtectHer API, from Expo config (`extra.apiUrl`).
 * Set via `EXPO_PUBLIC_API_URL` at bundle time (see `app.config.ts`).
 */
export function getApiBaseUrl(): string {
  const raw = Constants.expoConfig?.extra?.apiUrl;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(
      "Missing extra.apiUrl — check app.config.ts and EXPO_PUBLIC_API_URL.",
    );
  }
  return raw.replace(/\/$/, "");
}
