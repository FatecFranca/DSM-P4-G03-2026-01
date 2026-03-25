import { z } from "zod";
import { UserPublicSchema } from "./common.js";

export const RegisterRequestSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthSuccessResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresInSeconds: z.number().int().positive(),
  user: UserPublicSchema,
});

export type AuthSuccessResponse = z.infer<typeof AuthSuccessResponseSchema>;
