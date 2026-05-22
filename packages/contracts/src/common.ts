import { z } from "zod";

export const UuidSchema = z.string().uuid();

export const IsoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be a parseable ISO-8601 datetime",
  });

export const UserPublicSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  email: z.string().email(),
  createdAt: IsoDateTimeSchema,
});

export type UserPublic = z.infer<typeof UserPublicSchema>;
