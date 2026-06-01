import { z } from "zod";

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("protecther-api"),
  timestamp: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "timestamp must be a parseable ISO date string",
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
