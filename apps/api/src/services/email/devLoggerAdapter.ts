import type { FastifyBaseLogger } from "fastify";
import type {
  EmergencyInviteEmailPayload,
  EmergencyInviteEmailSender,
} from "./types.js";

/**
 * Development adapter: structured log only (no external provider).
 * Token is logged with a short prefix to avoid leaking full secrets in copy-paste logs.
 */
export function createDevLoggerEmailAdapter(
  log: FastifyBaseLogger,
): EmergencyInviteEmailSender {
  return {
    async sendEmergencyInvite(
      payload: EmergencyInviteEmailPayload,
    ): Promise<void> {
      const tokenPrefix = `${payload.invitationToken.slice(0, 8)}…`;
      log.info(
        {
          channel: "email",
          mode: "dev",
          toEmail: payload.toEmail,
          ownerName: payload.ownerName,
          tokenPrefix,
          expiresAt: payload.expiresAt.toISOString(),
        },
        "emergency_invite (dev — no provider)",
      );
    },
  };
}
