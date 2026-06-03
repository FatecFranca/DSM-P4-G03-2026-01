export const JWT_EXPIRES_SECONDS = Number(
  process.env.JWT_EXPIRES_SECONDS ?? 60 * 60 * 24 * 7,
);

export function isNonProductionNodeEnv(): boolean {
  const env = process.env.NODE_ENV ?? "development";
  return env !== "production";
}

export function parseTruthyEnv(name: string): boolean {
  const raw = process.env[name];
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function hasFirebaseServiceAccountConfig(): boolean {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return Boolean(json && json.trim() !== "");
}

export type PushProviderMode = "fcm" | "dev_log" | "stub";

/** Selects push delivery: FCM when creds exist and env allows; dev_log only logs in local dev. */
export function resolvePushProviderMode(): PushProviderMode {
  if (!hasFirebaseServiceAccountConfig()) {
    return isNonProductionNodeEnv() ? "dev_log" : "stub";
  }
  if (isNonProductionNodeEnv() && !parseTruthyEnv("PUSH_USE_FCM_IN_DEV")) {
    return "dev_log";
  }
  return "fcm";
}
