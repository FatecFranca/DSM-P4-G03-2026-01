import { randomBytes } from "node:crypto";
import {
  AcceptInviteParamsSchema,
  AcceptInviteResponseSchema,
  AcceptPendingInvitesResponseSchema,
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  DeleteContactParamsSchema,
  DeleteContactResponseSchema,
  EmergencyContactLinkSchema,
  ListContactsResponseSchema,
} from "@protecther/contracts";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { isNonProductionNodeEnv } from "../config/env.js";
import { db } from "../db/index.js";
import { emergencyContacts, invites, users } from "../db/schema.js";
import { normalizeEmail } from "../lib/email.js";
import { apiError } from "../lib/httpErrors.js";
import { toUserPublic } from "../lib/mappers.js";
import type { EmergencyInviteEmailSender } from "../services/email/types.js";
import {
  acceptInviteRecord,
  acceptPendingInvitesForUser,
  activateEmergencyContactLink,
  isPgUniqueViolation,
} from "../services/emergency/contactLinks.js";

const INVITE_TTL_HOURS = Number(process.env.INVITE_TTL_HOURS ?? 72);

function getUserId(request: { user?: { sub?: string } }): string | undefined {
  return request.user?.sub;
}

export async function registerEmergencyRoutes(
  app: FastifyInstance,
  emailSender: EmergencyInviteEmailSender,
): Promise<void> {
  app.post("/invites", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const parsed = CreateInviteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", parsed.error.message));
    }

    const targetEmail = normalizeEmail(parsed.data.targetEmail);

    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!owner) {
      return reply.status(401).send(apiError("UNAUTHORIZED", "User not found"));
    }

    if (targetEmail === normalizeEmail(owner.email)) {
      return reply
        .status(400)
        .send(apiError("SELF_INVITE", "Cannot invite your own email"));
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, targetEmail))
      .limit(1);

    if (targetUser) {
      const existingActive = await db
        .select({ id: emergencyContacts.id })
        .from(emergencyContacts)
        .where(
          and(
            eq(emergencyContacts.ownerUserId, owner.id),
            eq(emergencyContacts.contactUserId, targetUser.id),
            eq(emergencyContacts.status, "active"),
          ),
        )
        .limit(1);

      if (existingActive.length > 0) {
        return reply
          .status(409)
          .send(
            apiError(
              "CONTACT_EXISTS",
              "An active emergency contact link already exists",
            ),
          );
      }

      try {
        const linkRow = await db.transaction(async (tx) => {
          await tx
            .update(invites)
            .set({ status: "accepted" })
            .where(
              and(
                eq(invites.ownerUserId, owner.id),
                eq(invites.targetEmail, targetEmail),
                eq(invites.status, "pending"),
              ),
            );

          await activateEmergencyContactLink(tx, owner.id, targetUser.id);

          const [row] = await tx
            .select()
            .from(emergencyContacts)
            .where(
              and(
                eq(emergencyContacts.ownerUserId, owner.id),
                eq(emergencyContacts.contactUserId, targetUser.id),
                eq(emergencyContacts.status, "active"),
              ),
            )
            .limit(1);

          return row;
        });

        if (!linkRow) {
          return reply
            .status(500)
            .send(apiError("LINK_MISSING", "Could not load created link"));
        }

        const body = CreateInviteResponseSchema.parse({
          linkedImmediately: true,
          contactLinkId: linkRow.id,
        });

        return reply.status(201).send(body);
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          return reply
            .status(409)
            .send(
              apiError(
                "CONTACT_EXISTS",
                "An active emergency contact link already exists",
              ),
            );
        }
        request.log.error({ err: error }, "create_immediate_link_failed");
        return reply
          .status(500)
          .send(apiError("INTERNAL_ERROR", "Unexpected error"));
      }
    }

    const pending = await db
      .select({ id: invites.id })
      .from(invites)
      .where(
        and(
          eq(invites.ownerUserId, owner.id),
          eq(invites.targetEmail, targetEmail),
          eq(invites.status, "pending"),
        ),
      )
      .limit(1);

    if (pending.length > 0) {
      return reply
        .status(409)
        .send(apiError("INVITE_PENDING", "A pending invite already exists"));
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    const [inviteRow] = await db
      .insert(invites)
      .values({
        token,
        ownerUserId: owner.id,
        targetEmail,
        expiresAt,
        status: "pending",
      })
      .returning();

    if (!inviteRow) {
      return reply
        .status(500)
        .send(apiError("INSERT_FAILED", "Could not create invite"));
    }

    await emailSender.sendEmergencyInvite({
      toEmail: targetEmail,
      ownerName: owner.name,
      invitationToken: token,
      expiresAt,
    });

    const body = CreateInviteResponseSchema.parse({
      linkedImmediately: false,
      inviteId: inviteRow.id,
      expiresAt: inviteRow.expiresAt.toISOString(),
      ...(isNonProductionNodeEnv() ? { devInvitationToken: token } : {}),
    });

    return reply.status(201).send(body);
  });

  app.post("/invites/accept-pending", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const acceptedCount = await acceptPendingInvitesForUser(userId);
    const body = AcceptPendingInvitesResponseSchema.parse({ acceptedCount });
    return reply.send(body);
  });

  app.post("/invites/:token/accept", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const params = AcceptInviteParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", params.error.message));
    }

    const token = params.data.token;

    const [invitee] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!invitee) {
      return reply.status(401).send(apiError("UNAUTHORIZED", "User not found"));
    }

    const [inviteRow] = await db
      .select()
      .from(invites)
      .where(eq(invites.token, token))
      .limit(1);

    const inviteUnavailable = () =>
      reply
        .status(404)
        .send(
          apiError(
            "INVITE_UNAVAILABLE",
            "This invite is not available or has expired",
          ),
        );

    if (!inviteRow) {
      return inviteUnavailable();
    }

    if (inviteRow.expiresAt.getTime() < Date.now()) {
      await db
        .update(invites)
        .set({ status: "expired" })
        .where(eq(invites.id, inviteRow.id));

      return inviteUnavailable();
    }

    if (inviteRow.status !== "pending") {
      return inviteUnavailable();
    }

    if (normalizeEmail(invitee.email) !== inviteRow.targetEmail) {
      return reply
        .status(403)
        .send(
          apiError(
            "INVITE_CANNOT_ACCEPT",
            "You cannot accept this invite with the current account",
          ),
        );
    }

    if (inviteRow.ownerUserId === invitee.id) {
      return reply
        .status(400)
        .send(apiError("SELF_ACCEPT", "Cannot accept your own invite"));
    }

    const [ownerUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, inviteRow.ownerUserId))
      .limit(1);

    if (!ownerUser) {
      return reply
        .status(500)
        .send(apiError("OWNER_MISSING", "Invite owner not found"));
    }

    try {
      await db.transaction(async (tx) => {
        await acceptInviteRecord(
          tx,
          inviteRow.id,
          inviteRow.ownerUserId,
          invitee.id,
        );
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        return reply
          .status(409)
          .send(
            apiError(
              "CONTACT_EXISTS",
              "An active emergency contact link already exists",
            ),
          );
      }
      request.log.error({ err: error }, "accept_invite_failed");
      return reply
        .status(500)
        .send(apiError("INTERNAL_ERROR", "Unexpected error"));
    }

    const [linkRow] = await db
      .select()
      .from(emergencyContacts)
      .where(
        and(
          eq(emergencyContacts.ownerUserId, inviteRow.ownerUserId),
          eq(emergencyContacts.contactUserId, invitee.id),
          eq(emergencyContacts.status, "active"),
        ),
      )
      .limit(1);

    if (!linkRow) {
      return reply
        .status(500)
        .send(apiError("LINK_MISSING", "Could not load created link"));
    }

    const link = EmergencyContactLinkSchema.parse({
      id: linkRow.id,
      status: "active" as const,
      createdAt: linkRow.createdAt.toISOString(),
      owner: toUserPublic(ownerUser),
      contact: toUserPublic(invitee),
    });

    const body = AcceptInviteResponseSchema.parse({ link });
    return reply.send(body);
  });

  app.delete("/contacts/:linkId", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    const params = DeleteContactParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", params.error.message));
    }

    const [linkRow] = await db
      .select()
      .from(emergencyContacts)
      .where(
        and(
          eq(emergencyContacts.id, params.data.linkId),
          eq(emergencyContacts.status, "active"),
        ),
      )
      .limit(1);

    if (!linkRow) {
      return reply
        .status(404)
        .send(apiError("CONTACT_NOT_FOUND", "Contact link not found"));
    }

    const isParticipant =
      linkRow.ownerUserId === userId || linkRow.contactUserId === userId;

    if (!isParticipant) {
      return reply
        .status(403)
        .send(apiError("FORBIDDEN", "You cannot remove this contact link"));
    }

    await db
      .update(emergencyContacts)
      .set({ status: "revoked" })
      .where(eq(emergencyContacts.id, linkRow.id));

    const body = DeleteContactResponseSchema.parse({
      id: linkRow.id,
      status: "revoked" as const,
    });

    return reply.send(body);
  });

  app.get("/contacts", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply
        .status(401)
        .send(apiError("UNAUTHORIZED", "Missing authentication"));
    }

    await acceptPendingInvitesForUser(userId);

    const asOwnerRows = await db
      .select({
        link: emergencyContacts,
        contactUser: users,
      })
      .from(emergencyContacts)
      .innerJoin(users, eq(emergencyContacts.contactUserId, users.id))
      .where(
        and(
          eq(emergencyContacts.ownerUserId, userId),
          eq(emergencyContacts.status, "active"),
        ),
      );

    const asContactRows = await db
      .select({
        link: emergencyContacts,
        ownerUser: users,
      })
      .from(emergencyContacts)
      .innerJoin(users, eq(emergencyContacts.ownerUserId, users.id))
      .where(
        and(
          eq(emergencyContacts.contactUserId, userId),
          eq(emergencyContacts.status, "active"),
        ),
      );

    const body = ListContactsResponseSchema.parse({
      asOwner: asOwnerRows.map((row) => ({
        id: row.link.id,
        status: "active" as const,
        createdAt: row.link.createdAt.toISOString(),
        contact: toUserPublic(row.contactUser),
      })),
      asContact: asContactRows.map((row) => ({
        id: row.link.id,
        status: "active" as const,
        createdAt: row.link.createdAt.toISOString(),
        owner: toUserPublic(row.ownerUser),
      })),
    });

    return reply.send(body);
  });
}
