import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const DevicePlatformSchema = z.enum(["ios", "android", "web"]);

export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

export const RegisterPushTokenRequestSchema = z.object({
  platform: DevicePlatformSchema,
  token: z.string().min(1).max(4096),
});

export type RegisterPushTokenRequest = z.infer<
  typeof RegisterPushTokenRequestSchema
>;

export const RegisterPushTokenResponseSchema = z.object({
  ok: z.literal(true),
});

export type RegisterPushTokenResponse = z.infer<
  typeof RegisterPushTokenResponseSchema
>;

export const RegisterBleDeviceRequestSchema = z.object({
  deviceId: z.string().min(1).max(128),
  deviceName: z.string().min(1).max(128),
  serviceUuid: z.string().min(1).max(64),
  characteristicUuid: z.string().min(1).max(64),
});

export type RegisterBleDeviceRequest = z.infer<
  typeof RegisterBleDeviceRequestSchema
>;

export const BleDevicePublicSchema = z.object({
  id: UuidSchema,
  deviceId: z.string(),
  deviceName: z.string(),
  serviceUuid: z.string(),
  characteristicUuid: z.string(),
  isActive: z.boolean(),
  lastConnectedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});

export type BleDevicePublic = z.infer<typeof BleDevicePublicSchema>;

export const ListBleDevicesResponseSchema = z.object({
  devices: z.array(BleDevicePublicSchema),
});

export type ListBleDevicesResponse = z.infer<
  typeof ListBleDevicesResponseSchema
>;

export const RegisterBleDeviceResponseSchema = z.object({
  device: BleDevicePublicSchema,
});

export type RegisterBleDeviceResponse = z.infer<
  typeof RegisterBleDeviceResponseSchema
>;

export const UnregisterBleDeviceParamsSchema = z.object({
  deviceId: UuidSchema,
});

export type UnregisterBleDeviceParams = z.infer<
  typeof UnregisterBleDeviceParamsSchema
>;

export const UnregisterBleDeviceResponseSchema = z.object({
  ok: z.literal(true),
});

export type UnregisterBleDeviceResponse = z.infer<
  typeof UnregisterBleDeviceResponseSchema
>;
