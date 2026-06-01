import type { FastifyBaseLogger } from "fastify";
import { createDevLoggerEmailAdapter } from "./devLoggerAdapter.js";
import { createProductionStubEmailAdapter } from "./productionStubAdapter.js";
import type { EmergencyInviteEmailSender } from "./types.js";

export function createEmergencyInviteEmailSender(
  log: FastifyBaseLogger,
): EmergencyInviteEmailSender {
  const env = process.env.NODE_ENV ?? "development";
  if (env === "development" || env === "test") {
    return createDevLoggerEmailAdapter(log);
  }
  return createProductionStubEmailAdapter(log);
}
