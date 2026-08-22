import {
  RegisterBleDeviceRequestSchema,
  RegisterBleDeviceResponseSchema,
  RegisterPushTokenRequestSchema,
  RegisterPushTokenResponseSchema,
  UnregisterBleDeviceResponseSchema,
} from "@protecther/contracts";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { bleDevices, devicePushTokens } from "../db/schema.js";
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

    request.log.info(
      {
        userId,
        platform: parsed.data.platform,
        tokenPrefix: `${parsed.data.token.slice(0, 12)}…`,
      },
      "push_token_registered",
    );

    const body = RegisterPushTokenResponseSchema.parse({ ok: true as const });
    return reply.send(body);
  });

  app.post("/devices/ble", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const parsed = RegisterBleDeviceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", parsed.error.message));
    }

    const now = new Date();
    const [device] = await db
      .insert(bleDevices)
      .values({
        ownerUserId: userId,
        deviceId: parsed.data.deviceId,
        deviceName: parsed.data.deviceName,
        serviceUuid: parsed.data.serviceUuid,
        characteristicUuid: parsed.data.characteristicUuid,
        isActive: true,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [bleDevices.ownerUserId, bleDevices.deviceId],
        set: {
          deviceName: parsed.data.deviceName,
          serviceUuid: parsed.data.serviceUuid,
          characteristicUuid: parsed.data.characteristicUuid,
          isActive: true,
          updatedAt: now,
        },
      })
      .returning();

    const body = RegisterBleDeviceResponseSchema.parse({
      device: {
        id: device.id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        serviceUuid: device.serviceUuid,
        characteristicUuid: device.characteristicUuid,
        isActive: device.isActive,
        lastConnectedAt: device.lastConnectedAt?.toISOString() ?? null,
        createdAt: device.createdAt.toISOString(),
      },
    });
    return reply.status(201).send(body);
  });

  app.get("/devices/ble", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const devices = await db
      .select()
      .from(bleDevices)
      .where(eq(bleDevices.ownerUserId, userId))
      .orderBy(bleDevices.createdAt);

    return reply.send({
      devices: devices.map((d) => ({
        id: d.id,
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        serviceUuid: d.serviceUuid,
        characteristicUuid: d.characteristicUuid,
        isActive: d.isActive,
        lastConnectedAt: d.lastConnectedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  });

  app.delete("/devices/ble/:deviceId", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const { deviceId } = request.params as { deviceId: string };

    const existing = await db
      .select()
      .from(bleDevices)
      .where(
        and(eq(bleDevices.id, deviceId), eq(bleDevices.ownerUserId, userId)),
      )
      .limit(1);

    if (existing.length === 0) {
      return reply
        .status(404)
        .send(apiError("BLE_DEVICE_NOT_FOUND", "Device not found"));
    }

    await db.delete(bleDevices).where(eq(bleDevices.id, deviceId));

    const body = UnregisterBleDeviceResponseSchema.parse({ ok: true as const });
    return reply.send(body);
  });

  app.patch("/devices/ble/:deviceId/heartbeat", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const { deviceId } = request.params as { deviceId: string };

    const now = new Date();
    const [device] = await db
      .update(bleDevices)
      .set({ lastConnectedAt: now })
      .where(
        and(eq(bleDevices.id, deviceId), eq(bleDevices.ownerUserId, userId)),
      )
      .returning();

    if (!device) {
      return reply
        .status(404)
        .send(apiError("BLE_DEVICE_NOT_FOUND", "Device not found"));
    }

    return reply.send({
      ok: true,
      lastConnectedAt: device.lastConnectedAt?.toISOString() ?? null,
    });
  });
}
