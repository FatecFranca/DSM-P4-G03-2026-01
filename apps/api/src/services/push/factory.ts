import type { FastifyBaseLogger } from "fastify";
import { isNonProductionNodeEnv } from "../../config/env.js";
import { createDevLogPushProvider } from "./devLogProvider.js";
import { createFcmPushProvider } from "./fcmProvider.js";
import { createStubPushProvider } from "./stubProvider.js";
import type { PushProvider } from "./types.js";

export function createPushProvider(log: FastifyBaseLogger): PushProvider {
  if (isNonProductionNodeEnv()) {
    return createDevLogPushProvider(log);
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json && json.trim() !== "") {
    try {
      return createFcmPushProvider();
    } catch (err) {
      log.error({ err }, "fcm_init_failed_falling_back_stub");
      return createStubPushProvider();
    }
  }
  return createStubPushProvider();
}
