import { z } from "zod";

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
