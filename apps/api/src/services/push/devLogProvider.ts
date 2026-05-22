import type { FastifyBaseLogger } from "fastify";
import type { PushProvider } from "./types.js";

/** Development: log targets without FCM; marks success for local flows. */
export function createDevLogPushProvider(log: FastifyBaseLogger): PushProvider {
  return {
    async sendBatch(messages) {
      log.info(
        {
          channel: "push",
          mode: "dev_log",
          count: messages.length,
        },
        "push_dev_log",
      );
      return messages.map((m) => ({
        token: m.token,
        ok: true,
        messageId: "dev",
      }));
    },
  };
}
