import {
  AuthSuccessResponseSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
} from "@protecther/contracts";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { JWT_EXPIRES_SECONDS } from "../config/env.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { normalizeEmail } from "../lib/email.js";
import { apiError } from "../lib/httpErrors.js";
import { toUserPublic } from "../lib/mappers.js";

const BCRYPT_ROUNDS = 12;

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const direct = (error as { code?: string }).code;
  if (direct === "23505") {
    return true;
  }
  const cause = (error as { cause?: { code?: string } }).cause?.code;
  return cause === "23505";
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const parsed = RegisterRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(apiError("VALIDATION_ERROR", parsed.error.message));
    }

    const email = normalizeEmail(parsed.data.email);
    const passwordHash = bcrypt.hashSync(parsed.data.password, BCRYPT_ROUNDS);

    try {
      const [inserted] = await db
        .insert(users)
        .values({
          name: parsed.data.name,
          email,
          passwordHash,
        })
        .returning();

      if (!inserted) {
        return reply
          .status(500)
          .send(apiError("INSERT_FAILED", "Could not create user"));
      }

      const accessToken = await reply.jwtSign(
        { sub: inserted.id },
        { expiresIn: JWT_EXPIRES_SECONDS },
      );

      const body = AuthSuccessResponseSchema.parse({
        accessToken,
        tokenType: "Bearer" as const,
        expiresInSeconds: JWT_EXPIRES_SECONDS,
        user: toUserPublic(inserted),
      });

      return reply.status(201).send(body);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply
          .status(409)
          .send(apiError("EMAIL_IN_USE", "Email is already registered"));
      }
      request.log.error({ err: error }, "register_failed");
      return reply
        .status(500)
        .send(apiError("INTERNAL_ERROR", "Unexpected error"));
    }
  });

  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = LoginRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send(apiError("VALIDATION_ERROR", parsed.error.message));
      }

      const email = normalizeEmail(parsed.data.email);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const valid =
        user !== undefined &&
        bcrypt.compareSync(parsed.data.password, user.passwordHash);

      if (!valid) {
        return reply
          .status(401)
          .send(apiError("INVALID_CREDENTIALS", "Invalid email or password"));
      }

      const accessToken = await reply.jwtSign(
        { sub: user.id },
        { expiresIn: JWT_EXPIRES_SECONDS },
      );

      const body = AuthSuccessResponseSchema.parse({
        accessToken,
        tokenType: "Bearer" as const,
        expiresInSeconds: JWT_EXPIRES_SECONDS,
        user: toUserPublic(user),
      });

      return reply.send(body);
    },
  );
}
