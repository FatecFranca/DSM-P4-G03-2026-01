import { z } from "zod";
import { IsoDateTimeSchema, UserPublicSchema, UuidSchema } from "./common.js";

export const CreateInviteRequestSchema = z.object({
  targetEmail: z.string().email().max(320),
});

export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;

export const CreateInviteResponseSchema = z.object({
  /** True when the target already had an account and the link is active immediately. */
  linkedImmediately: z.boolean(),
  inviteId: UuidSchema.optional(),
  expiresAt: IsoDateTimeSchema.optional(),
  contactLinkId: UuidSchema.optional(),
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

export const AcceptPendingInvitesResponseSchema = z.object({
  acceptedCount: z.number().int().nonnegative(),
});

export type AcceptPendingInvitesResponse = z.infer<
  typeof AcceptPendingInvitesResponseSchema
>;

export const DeleteContactParamsSchema = z.object({
  linkId: UuidSchema,
});

export type DeleteContactParams = z.infer<typeof DeleteContactParamsSchema>;

export const DeleteContactResponseSchema = z.object({
  id: UuidSchema,
  status: z.literal("revoked"),
});

export type DeleteContactResponse = z.infer<typeof DeleteContactResponseSchema>;
