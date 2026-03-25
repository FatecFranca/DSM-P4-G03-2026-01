import type { FastifyBaseLogger } from "fastify";
import type {
  EmergencyInviteEmailPayload,
  EmergencyInviteEmailSender,
} from "./types.js";

/**
 * Production placeholder until SendGrid/SES is wired.
 * Logs metadata only (no full token, no body).
 */
export function createProductionStubEmailAdapter(
  log: FastifyBaseLogger,
): EmergencyInviteEmailSender {
  return {
    async sendEmergencyInvite(
      payload: EmergencyInviteEmailPayload,
    ): Promise<void> {
      log.warn(
        {
          channel: "email",
          mode: "stub",
          toEmail: payload.toEmail,
          expiresAt: payload.expiresAt.toISOString(),
        },
        "emergency_invite not delivered — configure email provider",
      );
    },
  };
}
