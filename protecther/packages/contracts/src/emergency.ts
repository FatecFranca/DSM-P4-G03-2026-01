import { z } from "zod";
import { IsoDateTimeSchema, UserPublicSchema, UuidSchema } from "./common.js";

export const CreateInviteRequestSchema = z.object({
  targetEmail: z.string().email().max(320),
});

export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;

export const CreateInviteResponseSchema = z.object({
  inviteId: UuidSchema,
  expiresAt: IsoDateTimeSchema,
  /** Present only in non-production environments for manual testing. */
  devInvitationToken: z.string().min(1).optional(),
});

export type CreateInviteResponse = z.infer<typeof CreateInviteResponseSchema>;

export const AcceptInviteParamsSchema = z.object({
  token: z.string().min(16).max(256),
});

export type AcceptInviteParams = z.infer<typeof AcceptInviteParamsSchema>;

export const EmergencyContactLinkSchema = z.object({
  id: UuidSchema,
  status: z.literal("active"),
  createdAt: IsoDateTimeSchema,
  owner: UserPublicSchema,
  contact: UserPublicSchema,
});

export type EmergencyContactLink = z.infer<typeof EmergencyContactLinkSchema>;

export const AcceptInviteResponseSchema = z.object({
  link: EmergencyContactLinkSchema,
});

export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;

export const ContactAsOwnerItemSchema = z.object({
  id: UuidSchema,
  status: z.literal("active"),
  createdAt: IsoDateTimeSchema,
  contact: UserPublicSchema,
});

export const ContactAsContactItemSchema = z.object({
  id: UuidSchema,
  status: z.literal("active"),
  createdAt: IsoDateTimeSchema,
  owner: UserPublicSchema,
});

export const ListContactsResponseSchema = z.object({
  asOwner: z.array(ContactAsOwnerItemSchema),
  asContact: z.array(ContactAsContactItemSchema),
});

export type ListContactsResponse = z.infer<typeof ListContactsResponseSchema>;
