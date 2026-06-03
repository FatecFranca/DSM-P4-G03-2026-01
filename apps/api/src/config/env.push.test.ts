import { afterEach, describe, expect, it } from "vitest";
import { resolvePushProviderMode } from "./env.js";

const ENV_KEYS = [
  "NODE_ENV",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "PUSH_USE_FCM_IN_DEV",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("resolvePushProviderMode", () => {
  const initial = snapshotEnv();

  afterEach(() => {
    restoreEnv(initial);
  });

  it("uses dev_log in development without Firebase credentials", () => {
    process.env.NODE_ENV = "development";
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.PUSH_USE_FCM_IN_DEV;
    expect(resolvePushProviderMode()).toBe("dev_log");
  });

  it("uses dev_log in development when FCM creds exist but PUSH_USE_FCM_IN_DEV is off", () => {
    process.env.NODE_ENV = "development";
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    process.env.PUSH_USE_FCM_IN_DEV = "false";
    expect(resolvePushProviderMode()).toBe("dev_log");
  });

  it("uses fcm in development when PUSH_USE_FCM_IN_DEV and Firebase JSON are set", () => {
    process.env.NODE_ENV = "development";
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    process.env.PUSH_USE_FCM_IN_DEV = "true";
    expect(resolvePushProviderMode()).toBe("fcm");
  });

  it("uses fcm in production when Firebase JSON is set", () => {
    process.env.NODE_ENV = "production";
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    delete process.env.PUSH_USE_FCM_IN_DEV;
    expect(resolvePushProviderMode()).toBe("fcm");
  });

  it("uses stub in production without Firebase credentials", () => {
    process.env.NODE_ENV = "production";
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    expect(resolvePushProviderMode()).toBe("stub");
  });
});
