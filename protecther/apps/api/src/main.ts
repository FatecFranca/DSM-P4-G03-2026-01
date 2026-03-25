import "dotenv/config";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { startAlertEscalationScheduler } from "./jobs/alertEscalationTick.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEmergencyRoutes } from "./routes/emergency.js";
import { registerHealthRoutes } from "./routes/health.js";
import { createAlertEscalationNotifier } from "./services/alertNotifications/factory.js";
import { createEmergencyInviteEmailSender } from "./services/email/factory.js";

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
          };
        },
      },
    },
    bodyLimit: 1_048_576,
  });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error("JWT_SECRET must be set (minimum 16 characters)");
  }

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyJwt, {
    secret: jwtSecret,
  });

  await app.register(rateLimit, {
    global: false,
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);

  const emailSender = createEmergencyInviteEmailSender(app.log);

  await app.register(
    async (scoped) => {
      scoped.addHook("onRequest", async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid or missing token",
            },
          });
        }
      });

      await registerEmergencyRoutes(scoped, emailSender);
    },
    { prefix: "/emergency" },
  );

  await app.register(async (scoped) => {
    scoped.addHook("onRequest", async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or missing token",
          },
        });
      }
    });

    await registerAlertRoutes(scoped);
  });

  const escalationNotifier = createAlertEscalationNotifier(app.log);
  const stopEscalationScheduler = startAlertEscalationScheduler(
    app.log,
    escalationNotifier,
  );
  app.addHook("onClose", async () => {
    stopEscalationScheduler();
  });

  return app;
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildServer();

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
