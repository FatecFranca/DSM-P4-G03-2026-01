import type { PushProvider } from "./types.js";

/** Production fallback when FCM is not configured: no delivery, auditable failures. */
export function createStubPushProvider(): PushProvider {
  return {
    async sendBatch(messages) {
      return messages.map((m) => ({
        token: m.token,
        ok: false,
        errorCode: "PROVIDER_NOT_CONFIGURED",
      }));
    },
  };
}
