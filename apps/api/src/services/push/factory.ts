import type { FastifyBaseLogger } from "fastify";
import { resolvePushProviderMode } from "../../config/env.js";
import { createDevLogPushProvider } from "./devLogProvider.js";
import { createFcmPushProvider } from "./fcmProvider.js";
import { createStubPushProvider } from "./stubProvider.js";
import type { PushProvider } from "./types.js";

export function createPushProvider(log: FastifyBaseLogger): PushProvider {
  const mode = resolvePushProviderMode();
  log.info({ pushProviderMode: mode }, "push_provider_selected");

  if (mode === "fcm") {
    try {
      return createFcmPushProvider();
    } catch (err) {
      log.error({ err }, "fcm_init_failed_falling_back_stub");
      return createStubPushProvider();
    }
  }
  if (mode === "dev_log") {
    return createDevLogPushProvider(log);
  }
  return createStubPushProvider();
}
