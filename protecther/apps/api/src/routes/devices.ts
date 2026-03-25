import {
  RegisterPushTokenRequestSchema,
  RegisterPushTokenResponseSchema,
} from "@protecther/contracts";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { devicePushTokens } from "../db/schema.js";
import { apiError } from "../lib/httpErrors.js";

function getUserId(request: { user?: { sub?: string } }): string | undefined {
  return request.user?.sub;
}

export async function registerDeviceRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post("/devices/push-token", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const parsed = RegisterPushTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", parsed.error.message));
    }

    const now = new Date();
    await db
      .insert(devicePushTokens)
      .values({
        userId,
        platform: parsed.data.platform,
        token: parsed.data.token,
        active: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [devicePushTokens.userId, devicePushTokens.token],
        set: {
          active: true,
          platform: parsed.data.platform,
          updatedAt: now,
        },
      });

    const body = RegisterPushTokenResponseSchema.parse({ ok: true as const });
    return reply.send(body);
  });
}
